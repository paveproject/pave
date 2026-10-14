import { useEffect, useRef } from 'react';
import NetInfo from '@react-native-community/netinfo';
import { useQueryClient } from '@tanstack/react-query';
import {
  devicesOptions,
  trustedByOptions,
  trustedContactInviteOptions,
  trustedContactsOptions,
} from '@libs/query-client';
import type { TrustedByResponse, TrustedContactResponse, UserEvent } from '@libs/api-js';
import { getSessionToken } from '../../lib/auth/session';
import { ME_WS_URL } from '../../env/common';
import { clearReceivedShare, getDeviceId, receiveDek, receiveShare } from '../../lib/recoveryKey';

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
  queryClient.setQueryData(trustedContactsOptions().queryKey, (old) => {
    if (!old) return old;
    const index = old.findIndex((c) => c.id === contact.id);
    if (index === -1) return [contact, ...old];
    const next = [...old];
    next[index] = contact;
    return next;
  });
};

const upsertTrustedBy = (
  queryClient: ReturnType<typeof useQueryClient>,
  deviceId: string | null,
  row: TrustedByResponse,
) => {
  queryClient.setQueryData(trustedByOptions(deviceId ?? undefined).queryKey, (old) => {
    if (!old) return old;
    const index = old.findIndex((r) => r.id === row.id);
    if (index === -1) return [row, ...old];
    const next = [...old];
    next[index] = row;
    return next;
  });
};

/**
 * Drops a row entirely rather than upserting it - `list_as_contact` only
 * ever returns `accepted` rows, so a revoked one has no business staying
 * in this cache (now persisted across cold starts too, see
 * `ReactQueryProvider.tsx`) until some unrelated refetch happens to
 * notice it's gone.
 */
const removeTrustedBy = (
  queryClient: ReturnType<typeof useQueryClient>,
  deviceId: string | null,
  id: string,
) => {
  queryClient.setQueryData(trustedByOptions(deviceId ?? undefined).queryKey, (old) =>
    old?.filter((r) => r.id !== id),
  );
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
      // Read once per connection, not per message - this device's id
      // doesn't change mid-session, and every handler below needs it to
      // target the right per-device "as-contact" cache entry (see
      // `trustedContactsKeys.asContact`'s own doc comment) or to tell a
      // `device_dek_updated` event meant for a sibling apart from one
      // meant for this device.
      const deviceId = await getDeviceId();
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
            upsertTrustedContact(queryClient, message);
            // The invite query is a GET that rotates the code on every
            // call (see `generate_invite`) - invalidating is enough, the
            // "add" screen's own `useQuery` (if open) refetches and gets
            // a fresh code for free, no manual regenerate logic needed.
            queryClient.invalidateQueries({ queryKey: trustedContactInviteOptions().queryKey });
          } else if (message.event === 'trusted_contact_share_updated') {
            upsertTrustedBy(queryClient, deviceId, message);
            if (message.encryptedShare) {
              receiveShare(message.owner.id, message.encryptedShare);
            }
          } else if (message.event === 'trusted_contact_revoked') {
            removeTrustedBy(queryClient, deviceId, message.id);
            clearReceivedShare(message.owner.id);
          } else if (message.event === 'device_registered') {
            // A sibling device just registered (or refreshed its own
            // registration) - invalidate rather than upsert, since this
            // device doesn't know the full "my devices" list shape well
            // enough to merge a single row in blind the way the
            // trusted-contact rows above can.
            queryClient.invalidateQueries({ queryKey: devicesOptions().queryKey });
          } else if (message.event === 'device_dek_updated') {
            if (message.id === deviceId && message.encryptedDek) {
              receiveDek(message.encryptedDek);
            }
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
