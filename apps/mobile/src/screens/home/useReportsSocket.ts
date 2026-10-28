import { useEffect, useRef } from 'react';
import NetInfo from '@react-native-community/netinfo';
import { useQueryClient } from '@tanstack/react-query';
import { applyReportsCreated, reportsKeys, type ReportsBoundingBox } from '@libs/query-client';
import type { ReportsClientMessage, ReportsResponse, ReportsServerMessage } from '@libs/api-js';
import { REPORTS_WS_URL } from '../../env/common';

/**
 * Live feed of newly created reports for the map's current viewport (see
 * `apps/api/src/app/reports/hub.rs`) - merges straight into the
 * `useReportsQuery(bbox)` cache, no refetch needed. Scoped to the map
 * screen's own lifecycle (connect on mount, close on unmount) rather than
 * an app-root provider, since reports only matter while the map is open.
 */
/** How often buffered live reports are folded into the cache. Long enough
 * that a burst costs one array rebuild instead of hundreds, short enough to
 * still read as live. */
const FLUSH_INTERVAL_MS = 700;

/** Past this many in a single flush, refetch instead of merging. Merging
 * hands the map raw single-report pins, which neither cluster nor stay
 * bounded; one refetch returns the viewport properly grouped by the server. */
const MERGE_LIMIT = 25;

export const useReportsSocket = (bbox: ReportsBoundingBox | undefined) => {
  const queryClient = useQueryClient();
  const socketRef = useRef<WebSocket | null>(null);
  const bboxRef = useRef(bbox);
  const pendingRef = useRef<ReportsResponse[]>([]);

  // Keeps `bboxRef` fresh without re-running the connect effect below (that
  // one only depends on `queryClient` - tearing the socket down and
  // reconnecting on every viewport change would defeat the point of this
  // ref). Refs must only be written outside of render, hence the effect
  // rather than a plain assignment here.
  useEffect(() => {
    bboxRef.current = bbox;
  }, [bbox]);

  useEffect(() => {
    let reconnectTimer: ReturnType<typeof setTimeout> | undefined;
    let closedByUs = false;

    const sendSubscribe = (socket: WebSocket, bbox: ReportsBoundingBox) => {
      const message: ReportsClientMessage = { event: 'subscribe', ...bbox };
      socket.send(JSON.stringify(message));
    };

    const connect = () => {
      const socket = new WebSocket(REPORTS_WS_URL);
      socketRef.current = socket;

      socket.onopen = () => {
        if (bboxRef.current) sendSubscribe(socket, bboxRef.current);
      };

      socket.onmessage = (event) => {
        try {
          const message: ReportsServerMessage = JSON.parse(event.data);
          if (message.event === 'report_created') {
            // Buffered, not applied here: see the flush effect below.
            pendingRef.current.push(message);
          }
        } catch {
          // Malformed frame - ignore rather than crash the socket loop.
        }
      };

      // NetInfo below also triggers reconnects on its own transition, but a
      // fixed short retry here covers plain server-side drops too.
      socket.onclose = () => {
        if (closedByUs) return;
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
      closedByUs = true;
      clearTimeout(reconnectTimer);
      unsubscribeNetInfo();
      socketRef.current?.close();
      socketRef.current = null;
    };
  }, [queryClient]);

  // Drains the buffer on a fixed interval rather than per message. Applying
  // each one meant an O(n) array rebuild, a `useMemo` pass over every feature
  // and a MapLibre source update, all per event - which is what crashed the
  // app under a sustained feed.
  useEffect(() => {
    const flush = setInterval(() => {
      const batch = pendingRef.current;
      if (batch.length === 0) return;
      pendingRef.current = [];

      const current = bboxRef.current;
      if (!current) return;

      if (batch.length > MERGE_LIMIT) {
        queryClient.invalidateQueries({ queryKey: reportsKeys.list(current) });
        return;
      }
      applyReportsCreated(queryClient, current, batch);
    }, FLUSH_INTERVAL_MS);

    return () => clearInterval(flush);
  }, [queryClient]);

  // Re-subscribes on the already-open socket whenever the viewport changes
  // significantly enough for `bounds` (in `MapMap`) to update - that only
  // fires at pan/zoom gesture-end, so no extra debouncing is needed here.
  useEffect(() => {
    const socket = socketRef.current;
    if (socket && socket.readyState === WebSocket.OPEN && bbox) {
      socket.send(JSON.stringify({ event: 'subscribe', ...bbox } satisfies ReportsClientMessage));
    }
  }, [bbox]);
};
