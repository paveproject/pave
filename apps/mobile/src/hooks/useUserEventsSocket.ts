import { useEffect, useRef } from 'react';
import NetInfo from '@react-native-community/netinfo';
import { useQueryClient } from '@tanstack/react-query';
import { trustedContactsKeys } from '@libs/query-client';
import type { TrustedContactResponse, UserEvent } from '@libs/api-js';
import { getSessionToken } from '../lib/auth/session';
import { ME_WS_URL } from '../env/common';

// React Native's WebSocket accepts a third `headers` option at runtime
// (unlike the strict browser spec its TS types are modeled on) - this
// cast is just to call the constructor with the shape its own native
// module actually supports.
const AuthenticatedWebSocket = WebSocket as unknown as new (
  url: string,
  protocols: undefined,
  options: { headers: Record<string, string> },
) => WebSocket;

/**
 * Merges the row the event just carried straight into the "mine" query's
 * cache - the event payload is the same shape the REST list endpoint
 * returns (see `UserEvent`'s own doc comment on the API side for why),
 * so there's no need to invalidate and refetch the whole list just to
 * reflect one row changing.
 *
 * Does nothing if the list was never fetched yet (`old` undefined) -
 * seeding the cache with a single partial row here would be wrong if the
 * owner has other contacts not yet loaded; the next real fetch covers it.
 */
const upsertTrustedContact = (
  queryClient: ReturnType<typeof useQueryClient>,
  contact: TrustedContactResponse,
) => {
  queryClient.setQueryData<TrustedContactResponse[]>(trustedContactsKeys.mine(), (old) => {
    if (!old) return old;
    const index = old.findIndex((c) => c.id === contact.id);
    if (index === -1) return [contact, ...old];
    const next = [...old];
    next[index] = contact;
    return next;
  });
};

/**
 * Personal realtime channel (see `apps/api/src/app/me/events`) - app-wide,
 * not screen-scoped like `useReportsSocket` (reports only matter on the
 * map; a trusted-contact accepting your invite matters regardless of
 * which screen is open). Connects once the user's logged in and stays
 * open for the app's lifetime - see `Providers.tsx`'s `UserEventsBootstrap`.
 */
export const useUserEventsSocket = (enabled: boolean) => {
  const queryClient = useQueryClient();
  const socketRef = useRef<WebSocket | null>(null);

  useEffect(() => {
    if (!enabled) return;

    let reconnectTimer: ReturnType<typeof setTimeout> | undefined;
    let cancelled = false;

    const connect = async () => {
      const token = await getSessionToken();
      if (!token || cancelled) return;

      // React Native's WebSocket (unlike the strict browser spec) accepts
      // a third `headers` option - used here instead of a query-string
      // token, so the bearer token never ends up in a URL that could get
      // logged. `/me/ws` authenticates at the upgrade request itself (see
      // `CurrentSession` on `user_events_ws`), so the header has to be on
      // the connection, not a first message after connecting.
      const socket = new AuthenticatedWebSocket(ME_WS_URL, undefined, {
        headers: { Authorization: `Bearer ${token}` },
      });
      socketRef.current = socket;

      socket.onmessage = (event) => {
        try {
          const message: UserEvent = JSON.parse(event.data);
          if (message.event === 'trusted_contact_accepted') {
            const { event: _event, ...contact } = message;
            upsertTrustedContact(queryClient, contact);
            // The invite query is a GET that rotates the code on every
            // call (see `generate_invite`) - invalidating is enough, the
            // "add" screen's own `useQuery` (if open) refetches and gets
            // a fresh code for free, no manual regenerate logic needed.
            queryClient.invalidateQueries({ queryKey: trustedContactsKeys.invite() });
          }
        } catch {
          // Malformed frame - ignore rather than crash the socket loop.
        }
      };

      // NetInfo below also triggers reconnects on its own transition, but
      // a fixed short retry here covers plain server-side drops too.
      socket.onclose = () => {
        if (cancelled) return;
        reconnectTimer = setTimeout(connect, 2000);
      };
      socket.onerror = () => socket.close();
    };

    connect();

    const unsubscribeNetInfo = NetInfo.addEventListener((state) => {
      const isOnline = !!state.isConnected && state.isInternetReachable !== false;
      if (isOnline && socketRef.current?.readyState !== WebSocket.OPEN) {
        connect();
      }
    });

    return () => {
      cancelled = true;
      clearTimeout(reconnectTimer);
      unsubscribeNetInfo();
      socketRef.current?.close();
      socketRef.current = null;
    };
  }, [enabled, queryClient]);
};
