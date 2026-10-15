use super::hub::{self, UserEventsHub};
use super::ws_dto::MeEventsUserEvent;
use crate::state::AppState;
use auth::AppAuthSchema;
use axum::extract::ws::{Message, WebSocket, WebSocketUpgrade};
use axum::extract::State;
use axum::response::IntoResponse;
use better_auth::integrations::axum::CurrentSession;
use tokio::sync::mpsc;

/// Personal realtime channel for the current user - unlike
/// `reports::handlers::reports_ws` (intentionally unauthenticated, public
/// geo data), this one requires a session: the hub registers the
/// connection under the session's own `user.id`, never anything
/// client-supplied. Not part of the OpenAPI `paths` (no REST shape for a
/// websocket) - `MeEventsUserEvent` is still registered as an OpenAPI schema (see
/// `main.rs`) purely so the generated TS client stays type-safe.
pub async fn user_events_ws(
    State(state): State<AppState>,
    session: CurrentSession<AppAuthSchema>,
    ws: WebSocketUpgrade,
) -> impl IntoResponse {
    ws.on_upgrade(move |socket| handle_socket(socket, state.user_events_hub, session.user.id))
}

async fn handle_socket(socket: WebSocket, hub: UserEventsHub, user_id: String) {
    use futures_util::{SinkExt, StreamExt};

    let conn_id = hub::next_connection_id();
    let (tx, mut rx) = mpsc::unbounded_channel::<MeEventsUserEvent>();
    hub.register(conn_id, user_id, tx);

    let (mut sink, mut stream) = socket.split();

    loop {
        tokio::select! {
            incoming = stream.next() => {
                match incoming {
                    Some(Ok(Message::Close(_))) | None => break,
                    // No client->server messages on this channel for now -
                    // just keep draining so ping/pong and close frames are
                    // still handled by the socket machinery.
                    _ => {}
                }
            }
            outgoing = rx.recv() => {
                let Some(outgoing) = outgoing else { break };
                let Ok(text) = serde_json::to_string(&outgoing) else { continue };
                if sink.send(Message::Text(text.into())).await.is_err() {
                    break;
                }
            }
        }
    }

    hub.deregister(conn_id);
}
