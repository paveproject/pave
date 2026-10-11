use super::ws_dto::ServerMessage;
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

const CHANNEL_PREFIX: &str = "reports:cell:";

fn channel_name(cell: &str) -> String {
    format!("{CHANNEL_PREFIX}{cell}")
}

fn cell_from_channel(channel: &str) -> &str {
    channel.strip_prefix(CHANNEL_PREFIX).unwrap_or(channel)
}

enum HubCommand {
    Register {
        conn_id: ConnectionId,
        tx: mpsc::UnboundedSender<ServerMessage>,
    },
    Deregister {
        conn_id: ConnectionId,
    },
    SetInterest {
        conn_id: ConnectionId,
        cells: HashSet<String>,
    },
    Publish {
        cells: HashSet<String>,
        message: ServerMessage,
    },
}

/// Per-pod fan-out hub: one actor task owns all subscription bookkeeping
/// plus the single Redis pub/sub connection for this process, so websocket
/// connection tasks never touch shared mutable state directly - they just
/// send commands over an mpsc channel.
///
/// Coordination ACROSS pods (running behind a load balancer with no sticky
/// sessions) goes entirely through Redis: this pod only `SUBSCRIBE`s to the
/// geohash cells at least one of its own local connections currently wants,
/// and `publish` always goes through Redis rather than ever delivering to a
/// local connection directly - so behavior is identical whether the
/// relevant connection lives on this pod or another one entirely.
#[derive(Clone)]
pub struct ReportsHub {
    cmd_tx: mpsc::UnboundedSender<HubCommand>,
}

impl ReportsHub {
    pub fn spawn(redis_url: String) -> Self {
        let (cmd_tx, cmd_rx) = mpsc::unbounded_channel();
        tokio::spawn(run(redis_url, cmd_rx));
        Self { cmd_tx }
    }

    pub fn register(&self, conn_id: ConnectionId, tx: mpsc::UnboundedSender<ServerMessage>) {
        let _ = self.cmd_tx.send(HubCommand::Register { conn_id, tx });
    }

    pub fn deregister(&self, conn_id: ConnectionId) {
        let _ = self.cmd_tx.send(HubCommand::Deregister { conn_id });
    }

    /// Replaces this connection's full set of subscribed cells (diffed
    /// internally against its prior set to issue only the needed
    /// Redis SUBSCRIBE/UNSUBSCRIBE calls).
    pub fn set_interest(&self, conn_id: ConnectionId, cells: HashSet<String>) {
        let _ = self.cmd_tx.send(HubCommand::SetInterest { conn_id, cells });
    }

    pub fn publish(&self, cells: HashSet<String>, message: ServerMessage) {
        let _ = self.cmd_tx.send(HubCommand::Publish { cells, message });
    }
}

#[derive(Default)]
struct HubState {
    // Each connection's own sender plus the cells it currently subscribes to.
    connections: HashMap<ConnectionId, (mpsc::UnboundedSender<ServerMessage>, HashSet<String>)>,
    // Reverse index: which connections care about a given cell - this is
    // also what decides whether we need a live Redis subscription for it.
    cell_subscribers: HashMap<String, HashSet<ConnectionId>>,
}

impl HubState {
    async fn set_interest(
        &mut self,
        sink: &mut PubSubSink,
        conn_id: ConnectionId,
        new_cells: HashSet<String>,
    ) {
        let Some((_, old_cells)) = self.connections.get(&conn_id) else {
            return;
        };
        let old_cells = old_cells.clone();

        for cell in old_cells.difference(&new_cells) {
            self.remove_subscriber(sink, conn_id, cell).await;
        }
        for cell in new_cells.difference(&old_cells) {
            self.add_subscriber(sink, conn_id, cell).await;
        }
        if let Some((_, cells)) = self.connections.get_mut(&conn_id) {
            *cells = new_cells;
        }
    }

    async fn deregister(&mut self, sink: &mut PubSubSink, conn_id: ConnectionId) {
        let Some((_, cells)) = self.connections.remove(&conn_id) else {
            return;
        };
        for cell in &cells {
            self.remove_subscriber(sink, conn_id, cell).await;
        }
    }

    async fn add_subscriber(&mut self, sink: &mut PubSubSink, conn_id: ConnectionId, cell: &str) {
        let subscribers = self.cell_subscribers.entry(cell.to_string()).or_default();
        let was_empty = subscribers.is_empty();
        subscribers.insert(conn_id);
        if was_empty {
            if let Err(err) = sink.subscribe(channel_name(cell)).await {
                tracing::warn!(cell, %err, "failed to subscribe to reports geo channel");
            }
        }
    }

    async fn remove_subscriber(
        &mut self,
        sink: &mut PubSubSink,
        conn_id: ConnectionId,
        cell: &str,
    ) {
        if let Some(subscribers) = self.cell_subscribers.get_mut(cell) {
            subscribers.remove(&conn_id);
            if subscribers.is_empty() {
                self.cell_subscribers.remove(cell);
                if let Err(err) = sink.unsubscribe(channel_name(cell)).await {
                    tracing::warn!(cell, %err, "failed to unsubscribe from reports geo channel");
                }
            }
        }
    }

    fn dispatch(&self, cell: &str, message: &ServerMessage) {
        let Some(conn_ids) = self.cell_subscribers.get(cell) else {
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
            tracing::error!(%err, "reports hub: invalid redis url, fan-out disabled");
            return;
        }
    };

    let (mut sink, mut stream): (PubSubSink, PubSubStream) = match client.get_async_pubsub().await {
        Ok(pubsub) => pubsub.split(),
        Err(err) => {
            tracing::error!(%err, "reports hub: failed to open redis pubsub connection, fan-out disabled");
            return;
        }
    };

    let mut publish_conn = match client.get_connection_manager().await {
        Ok(conn) => conn,
        Err(err) => {
            tracing::error!(%err, "reports hub: failed to open redis connection for publishing");
            return;
        }
    };

    let mut state = HubState::default();

    loop {
        tokio::select! {
            cmd = cmd_rx.recv() => {
                let Some(cmd) = cmd else { break };
                match cmd {
                    HubCommand::Register { conn_id, tx } => {
                        state.connections.insert(conn_id, (tx, HashSet::new()));
                    }
                    HubCommand::Deregister { conn_id } => {
                        state.deregister(&mut sink, conn_id).await;
                    }
                    HubCommand::SetInterest { conn_id, cells } => {
                        state.set_interest(&mut sink, conn_id, cells).await;
                    }
                    HubCommand::Publish { cells, message } => {
                        let Ok(payload) = serde_json::to_string(&message) else { continue };
                        for cell in cells {
                            let res: redis::RedisResult<i64> =
                                publish_conn.publish(channel_name(&cell), payload.clone()).await;
                            if let Err(err) = res {
                                tracing::warn!(cell, %err, "failed to publish report event");
                            }
                        }
                    }
                }
            }
            msg = stream.next() => {
                let Some(msg) = msg else { break };
                let Ok(payload) = msg.get_payload::<String>() else { continue };
                let Ok(event) = serde_json::from_str::<ServerMessage>(&payload) else { continue };
                let cell = cell_from_channel(msg.get_channel_name());
                state.dispatch(cell, &event);
            }
        }
    }
}
