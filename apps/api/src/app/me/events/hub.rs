use super::ws_dto::MeEventsUserEvent;
use futures_util::StreamExt;
use redis::aio::{PubSubSink, PubSubStream};
use redis::AsyncCommands;
use std::collections::{HashMap, HashSet};
use std::sync::atomic::{AtomicU64, Ordering};
use tokio::sync::mpsc;

pub type ConnectionId = u64;

static NEXT_CONNECTION_ID: AtomicU64 = AtomicU64::new(1);

pub fn next_connection_id() -> ConnectionId {
    NEXT_CONNECTION_ID.fetch_add(1, Ordering::Relaxed)
}

const CHANNEL_PREFIX: &str = "user:events:";

fn channel_name(user_id: &str) -> String {
    format!("{CHANNEL_PREFIX}{user_id}")
}

enum HubCommand {
    Register {
        conn_id: ConnectionId,
        user_id: String,
        tx: mpsc::UnboundedSender<MeEventsUserEvent>,
    },
    Deregister {
        conn_id: ConnectionId,
    },
    Publish {
        user_id: String,
        message: MeEventsUserEvent,
    },
}

/// A user's personal realtime channel - same per-pod actor + cross-pod
/// Redis pub/sub fan-out shape as `reports::hub::ReportsHub`, simplified:
/// each connection is tied to exactly one user id for its whole lifetime
/// (the authenticated session's own, see `handlers::user_events_ws`), so
/// there's no dynamic interest set to manage, just one subscribe at
/// connect and one unsubscribe at disconnect.
#[derive(Clone)]
pub struct UserEventsHub {
    cmd_tx: mpsc::UnboundedSender<HubCommand>,
}

impl UserEventsHub {
    pub fn spawn(redis_url: String) -> Self {
        let (cmd_tx, cmd_rx) = mpsc::unbounded_channel();
        tokio::spawn(run(redis_url, cmd_rx));
        Self { cmd_tx }
    }

    pub fn register(
        &self,
        conn_id: ConnectionId,
        user_id: String,
        tx: mpsc::UnboundedSender<MeEventsUserEvent>,
    ) {
        let _ = self.cmd_tx.send(HubCommand::Register {
            conn_id,
            user_id,
            tx,
        });
    }

    pub fn deregister(&self, conn_id: ConnectionId) {
        let _ = self.cmd_tx.send(HubCommand::Deregister { conn_id });
    }

    pub fn publish(&self, user_id: String, message: MeEventsUserEvent) {
        let _ = self.cmd_tx.send(HubCommand::Publish { user_id, message });
    }
}

#[derive(Default)]
struct HubState {
    // Each connection's own sender plus the user id it's registered under.
    connections: HashMap<ConnectionId, (mpsc::UnboundedSender<MeEventsUserEvent>, String)>,
    // Reverse index: which connections (on this pod) care about a given
    // user id - also what decides whether we need a live Redis
    // subscription for it. Almost always zero or one entry (a user with
    // two devices connected at once being the only case with more).
    user_subscribers: HashMap<String, HashSet<ConnectionId>>,
}

impl HubState {
    async fn register(
        &mut self,
        sink: &mut PubSubSink,
        conn_id: ConnectionId,
        user_id: String,
        tx: mpsc::UnboundedSender<MeEventsUserEvent>,
    ) {
        let subscribers = self.user_subscribers.entry(user_id.clone()).or_default();
        let was_empty = subscribers.is_empty();
        subscribers.insert(conn_id);
        if was_empty {
            if let Err(err) = sink.subscribe(channel_name(&user_id)).await {
                tracing::warn!(%user_id, %err, "failed to subscribe to user events channel");
            }
        }
        self.connections.insert(conn_id, (tx, user_id));
    }

    async fn deregister(&mut self, sink: &mut PubSubSink, conn_id: ConnectionId) {
        let Some((_, user_id)) = self.connections.remove(&conn_id) else {
            return;
        };
        if let Some(subscribers) = self.user_subscribers.get_mut(&user_id) {
            subscribers.remove(&conn_id);
            if subscribers.is_empty() {
                self.user_subscribers.remove(&user_id);
                if let Err(err) = sink.unsubscribe(channel_name(&user_id)).await {
                    tracing::warn!(%user_id, %err, "failed to unsubscribe from user events channel");
                }
            }
        }
    }

    fn dispatch(&self, user_id: &str, message: &MeEventsUserEvent) {
        let Some(conn_ids) = self.user_subscribers.get(user_id) else {
            return;
        };
        for conn_id in conn_ids {
            if let Some((tx, _)) = self.connections.get(conn_id) {
                let _ = tx.send(message.clone());
            }
        }
    }
}

async fn run(redis_url: String, mut cmd_rx: mpsc::UnboundedReceiver<HubCommand>) {
    let client = match redis::Client::open(redis_url) {
        Ok(client) => client,
        Err(err) => {
            tracing::error!(%err, "user events hub: invalid redis url, fan-out disabled");
            return;
        }
    };

    let (mut sink, mut stream): (PubSubSink, PubSubStream) = match client.get_async_pubsub().await {
        Ok(pubsub) => pubsub.split(),
        Err(err) => {
            tracing::error!(%err, "user events hub: failed to open redis pubsub connection, fan-out disabled");
            return;
        }
    };

    let mut publish_conn = match client.get_connection_manager().await {
        Ok(conn) => conn,
        Err(err) => {
            tracing::error!(%err, "user events hub: failed to open redis connection for publishing");
            return;
        }
    };

    let mut state = HubState::default();

    loop {
        tokio::select! {
            cmd = cmd_rx.recv() => {
                let Some(cmd) = cmd else { break };
                match cmd {
                    HubCommand::Register { conn_id, user_id, tx } => {
                        state.register(&mut sink, conn_id, user_id, tx).await;
                    }
                    HubCommand::Deregister { conn_id } => {
                        state.deregister(&mut sink, conn_id).await;
                    }
                    HubCommand::Publish { user_id, message } => {
                        let Ok(payload) = serde_json::to_string(&message) else { continue };
                        let res: redis::RedisResult<i64> =
                            publish_conn.publish(channel_name(&user_id), payload).await;
                        if let Err(err) = res {
                            tracing::warn!(%user_id, %err, "failed to publish user event");
                        }
                    }
                }
            }
            msg = stream.next() => {
                let Some(msg) = msg else { break };
                let Ok(payload) = msg.get_payload::<String>() else { continue };
                let Ok(event) = serde_json::from_str::<MeEventsUserEvent>(&payload) else { continue };
                let channel = msg.get_channel_name();
                let user_id = channel.strip_prefix(CHANNEL_PREFIX).unwrap_or(channel);
                state.dispatch(user_id, &event);
            }
        }
    }
}
