import { io, Socket } from 'socket.io-client';
import { REALTIME_NAMESPACE, MeServerEvents } from '@libs/realtime';
import { MeResponse } from './__generated__';

export interface MeServerToClientEvents {
  [MeServerEvents.UPDATED]: (user: MeResponse) => void;
}

export type RealtimeSocket = Socket<MeServerToClientEvents>;

export interface MeCallbacks {
  onMeUpdated?: (user: MeResponse) => void;
}

export interface RealtimeConfig {
  baseUrl?: string;
  getAuthCookie?: () => Promise<string | null> | string | null;
}

class RealtimeManager {
  private socket: RealtimeSocket | null = null;
  private connectPromise: Promise<RealtimeSocket> | null = null;

  private config: RealtimeConfig = {
    baseUrl: 'https://api.pave.app',
    getAuthCookie: () => null,
  };

  public setConfig(newConfig: Partial<RealtimeConfig>) {
    this.config = { ...this.config, ...newConfig };
  }

  private async createSocket(): Promise<RealtimeSocket> {
    if (this.socket) return this.socket;
    if (this.connectPromise) return this.connectPromise;

    this.connectPromise = (async () => {
      let origin = this.config.baseUrl || 'https://api.pave.app';
      try {
        origin = new URL(origin).origin;
      } catch {
        console.warn('[Realtime] Invalid base URL for realtime manager', this.config.baseUrl);
      }

      const cookie = this.config.getAuthCookie ? await this.config.getAuthCookie() : null;

      const socket: RealtimeSocket = io(`${origin}${REALTIME_NAMESPACE}`, {
        autoConnect: false,
        withCredentials: true,
        transports: ['websocket'],
        extraHeaders: cookie ? { Cookie: cookie } : {},
      });

      socket.connect();
      this.socket = socket;
      return socket;
    })();

    return this.connectPromise;
  }

  /** Opens the persistent connection. Idempotent — safe to call from multiple mount points. */
  public connect(): Promise<RealtimeSocket> {
    return this.createSocket();
  }

  /** Tears down the connection — call on logout. */
  public disconnect() {
    this.socket?.disconnect();
    this.socket = null;
    this.connectPromise = null;
  }

  /**
   * Registers "me" (own profile) event callbacks on the shared connection, connecting it first
   * if needed. Returns an unsubscribe function. Meant to be called once app-wide (see
   * `useRealtimeSync` in `@libs/query-client`) — keeps the current user's profile in sync across
   * every one of their own devices.
   */
  public onMeEvents(callbacks: MeCallbacks): () => void {
    let isUnsubscribed = false;
    let socketInstance: RealtimeSocket | null = null;

    this.createSocket().then((socket) => {
      if (isUnsubscribed) return;
      socketInstance = socket;

      if (callbacks.onMeUpdated) {
        socket.on(MeServerEvents.UPDATED, callbacks.onMeUpdated);
      }
    });

    return () => {
      isUnsubscribed = true;
      if (!socketInstance) return;

      if (callbacks.onMeUpdated) {
        socketInstance.off(MeServerEvents.UPDATED, callbacks.onMeUpdated);
      }
    };
  }
}

export const realtime = new RealtimeManager();
