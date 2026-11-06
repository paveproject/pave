import { useCallback, useEffect, useMemo, useState } from 'react';
import { ScrollView, useWindowDimensions } from 'react-native';
import { Map, Camera, GeoJSONSource, Layer } from '@maplibre/maplibre-react-native';
import { useLocalSearchParams } from 'expo-router';
import { useFormatter, useTranslations } from 'use-intl';
import { useTheme } from '../../providers/ThemeProvider';
import { MAPTILER_API_KEY } from '../../env/common';
import { useObservable } from '../../hooks/useObservable';
import { database } from '../../lib/watermelon/database';
import { PROTEST_SESSION_TABLE } from '../../lib/watermelon/schema';
import { observePositions } from '../../lib/watermelon/protestSessions';
import { useRemoteProtestSession } from '../../hooks/protestMode/useRemoteProtestSession';
import type { ProtestSession } from '../../lib/watermelon/models/ProtestSession';
import type { ProtestPosition } from '../../lib/watermelon/models/ProtestPosition';
import { View } from '../../components/ui/view';
import { Text } from '../../components/ui/text';
import { logger } from '../../logger';

/** Same sources as `screens/home/HomeMap.tsx`, not shared: that screen's
 * variant is a user setting, this one always wants the street map. */
const FALLBACK_STYLE_URL = 'https://demotiles.maplibre.org/style.json';
const MAPTILER_STYLE_URLS = {
  light: 'https://api.maptiler.com/maps/streets-v2/style.json',
  dark: 'https://api.maptiler.com/maps/streets-v2-dark/style.json',
} as const;

/** Enough to read a route's shape without pushing the numbers off-screen. */
const MAP_HEIGHT_RATIO = 0.4;

/**
 * Smallest extent worth fitting a camera to, about 50m. Below it the bounding
 * box is a point and `bounds` cannot yield a zoom: the camera lands on (0, 0),
 * open ocean. Standing still for a whole protest is a normal recording.
 */
const MIN_SPAN_DEGREES = 0.0005;

/** Keeps the first and last fix clear of the rounded corners. */
const MAP_PADDING = { top: 32, right: 32, bottom: 32, left: 32 } as const;

const frameFor = (lngs: number[], lats: number[]) => {
  const [minLng, maxLng] = [Math.min(...lngs), Math.max(...lngs)];
  const [minLat, maxLat] = [Math.min(...lats), Math.max(...lats)];

  if (maxLng - minLng < MIN_SPAN_DEGREES && maxLat - minLat < MIN_SPAN_DEGREES) {
    return {
      center: [(minLng + maxLng) / 2, (minLat + maxLat) / 2] as [number, number],
      // Close enough to place a stationary recording on a corner, not so
      // close that GPS jitter looks like movement.
      zoom: 16,
      padding: MAP_PADDING,
    };
  }

  return {
    bounds: [minLng, minLat, maxLng, maxLat] as [number, number, number, number],
    padding: MAP_PADDING,
  };
};

/** The least a point needs to be drawn, so the map doesn't care whether the
 * trajectory came from the local database or from the server. */
interface TracePoint {
  key: string;
  lat: number;
  lng: number;
  recordedAt: Date;
  /** False only for a local point whose batch hasn't landed yet. */
  synced: boolean;
}

/** Only rendered when there is something to draw: a map framing zero points
 * says less than no map at all. */
const TraceMap = ({ positions }: { positions: TracePoint[] }) => {
  const { colors, theme, mode } = useTheme();
  const { height } = useWindowDimensions();

  const styleUrl = MAPTILER_API_KEY
    ? `${MAPTILER_STYLE_URLS[mode === 'dark' ? 'dark' : 'light']}?key=${MAPTILER_API_KEY}`
    : FALLBACK_STYLE_URL;

  const { shape, viewState } = useMemo(() => {
    // Oldest first, so the line is drawn in the order it was walked.
    const ordered = [...positions].sort((a, b) => a.recordedAt.getTime() - b.recordedAt.getTime());
    const coordinates = ordered.map((row) => [row.lng, row.lat] as [number, number]);
    const lngs = coordinates.map(([lng]) => lng);
    const lats = coordinates.map(([, lat]) => lat);

    return {
      shape: {
        type: 'FeatureCollection' as const,
        features: [
          {
            type: 'Feature' as const,
            properties: {},
            geometry: { type: 'LineString' as const, coordinates },
          },
          // On top of the line: a straight segment between two distant fixes
          // hides how sparse the sampling was.
          ...coordinates.map((coordinate) => ({
            type: 'Feature' as const,
            properties: {},
            geometry: { type: 'Point' as const, coordinates: coordinate },
          })),
        ],
      },
      viewState: frameFor(lngs, lats),
    };
  }, [positions]);

  return (
    <Map
      mapStyle={styleUrl}
      style={{
        height: height * MAP_HEIGHT_RATIO,
        borderRadius: theme.border.radius.lg,
      }}
      attribution={false}
      logo={false}
      // Inert: a figure, not a map to navigate - and panning would fight the
      // ScrollView it sits in.
      dragPan={false}
      touchZoom={false}
      doubleTapZoom={false}
      doubleTapHoldZoom={false}
      touchRotate={false}
      touchPitch={false}
    >
      <Camera initialViewState={viewState} />
      <GeoJSONSource id="protest-trace" data={shape}>
        <Layer
          id="protest-trace-line"
          type="line"
          layout={{ 'line-cap': 'round', 'line-join': 'round' }}
          paint={{ 'line-color': colors.primary, 'line-width': 4, 'line-opacity': 0.9 }}
        />
        <Layer
          id="protest-trace-points"
          type="circle"
          paint={{
            'circle-radius': 3,
            'circle-color': colors.primary,
            'circle-stroke-width': 1.5,
            'circle-stroke-color': colors.background,
          }}
        />
      </GeoJSONSource>
    </Map>
  );
};

const ProtestSessionDetailScreen = () => {
  const { id } = useLocalSearchParams<{ id: string }>();
  const t = useTranslations();
  const format = useFormatter();
  const { colors, theme } = useTheme();
  const [session, setSession] = useState<ProtestSession | null>(null);

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    database
      .get<ProtestSession>(PROTEST_SESSION_TABLE)
      .find(id)
      .then((row) => {
        if (!cancelled) setSession(row);
      })
      .catch((error) => logger.error('protest: session not found', { id, error }));
    return () => {
      cancelled = true;
    };
  }, [id]);

  const getPositions = useCallback(() => observePositions(id ?? ''), [id]);
  const local = useObservable<ProtestPosition[]>(getPositions, []);
  // Just this one, by id - no need to pull and decrypt every sibling to show
  // one trajectory.
  const { session: remoteSession, isLoading: isReadingRemote } = useRemoteProtestSession(id);

  // Local wins when it has anything: it is instant, works offline, and is the
  // only side that knows what is still unsent. The server is the fallback for
  // a device that doesn't hold these rows - reinstalled, replaced, or simply
  // not the one that recorded.
  const positions: TracePoint[] = useMemo(() => {
    if (local.length > 0) {
      return local.map((row) => ({
        key: row.id,
        lat: row.lat,
        lng: row.lng,
        recordedAt: row.recordedAt,
        synced: row.synced,
      }));
    }
    return (remoteSession?.positions ?? []).map((point, index) => ({
      key: `${point.recordedAt.toISOString()}-${index}`,
      lat: point.lat,
      lng: point.lng,
      recordedAt: point.recordedAt,
      synced: true,
    }));
  }, [local, remoteSession]);

  const startedAt = session?.startedAt ?? remoteSession?.startedAt;
  const endedAt = session?.endedAt ?? remoteSession?.endedAt ?? null;
  const synced = positions.filter((row) => row.synced).length;

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <ScrollView contentInsetAdjustmentBehavior="automatic">
        <View style={{ padding: theme.spaces.horizontal, gap: theme.spaces.sm }}>
          <Text variant="title">
            {startedAt
              ? format.dateTime(startedAt, {
                  weekday: 'long',
                  day: 'numeric',
                  month: 'long',
                  hour: '2-digit',
                  minute: '2-digit',
                })
              : '—'}
          </Text>
          <Text textColor="muted">
            {endedAt
              ? t('pages.protest_mode.sessions.ended_at', {
                  time: format.dateTime(endedAt, { hour: '2-digit', minute: '2-digit' }),
                })
              : t('pages.protest_mode.sessions.open')}
          </Text>
          {/* While the blobs are still being fetched and decrypted there is
              nothing to count yet - saying "0 positions" would be a lie. */}
          {positions.length === 0 && isReadingRemote ? (
            <Text textColor="muted">{t('pages.protest_mode.sessions.reading')}</Text>
          ) : (
            <Text textColor="muted">
              {`${t('pages.protest_mode.sessions.positions', { count: positions.length })} · ${
                positions.length === synced
                  ? t('pages.protest_mode.sessions.all_sent')
                  : t('pages.protest_mode.sessions.pending', {
                      count: positions.length - synced,
                    })
              }`}
            </Text>
          )}
        </View>

        {positions.length > 0 ? (
          <View
            style={{
              paddingHorizontal: theme.spaces.horizontal,
              paddingBottom: theme.spaces.xl,
              gap: theme.spaces.sm,
            }}
          >
            <Text variant="title">{t('pages.protest_mode.sessions.trace')}</Text>
            <TraceMap positions={positions} />
          </View>
        ) : null}

        <View style={{ paddingHorizontal: theme.spaces.horizontal, gap: theme.spaces.xs }}>
          {positions.map((position) => (
            <View
              key={position.key}
              style={{ flexDirection: 'row', alignItems: 'center', gap: theme.spaces.sm }}
            >
              <Text
                style={{
                  flex: 1,
                  fontVariant: ['tabular-nums'],
                  color: position.synced ? colors.foreground : colors.destructive,
                }}
              >
                {`${position.lat.toFixed(5)}, ${position.lng.toFixed(5)}`}
              </Text>
              <Text textColor="muted" style={{ fontVariant: ['tabular-nums'] }}>
                {format.dateTime(position.recordedAt, { hour: '2-digit', minute: '2-digit' })}
              </Text>
            </View>
          ))}
        </View>
      </ScrollView>
    </View>
  );
};

export default ProtestSessionDetailScreen;
