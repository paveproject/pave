import { forwardRef, useCallback, useImperativeHandle, useMemo, useRef, useState } from 'react';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  Map,
  Camera,
  GeoJSONSource,
  Layer,
  type CameraRef,
  type LngLatBounds,
} from '@maplibre/maplibre-react-native';
import { useFormatter, useTranslations } from 'use-intl';
import { useTheme } from '../../../providers/ThemeProvider';
import { MAPTILER_API_KEY } from '../../../env/common';
import { View } from '../../../components/ui/view';
import { Text } from '../../../components/ui/text';

/** Same sources as `screens/home/HomeMap.tsx`, not shared: that screen's
 * variant is a user setting, this one always wants the street map. */
const FALLBACK_STYLE_URL = 'https://demotiles.maplibre.org/style.json';
const MAPTILER_STYLE_URLS = {
  light: 'https://api.maptiler.com/maps/streets-v2/style.json',
  dark: 'https://api.maptiler.com/maps/streets-v2-dark/style.json',
} as const;

/**
 * Smallest extent worth fitting a camera to, about 50m. Below it the bounding
 * box is a point and `bounds` cannot yield a zoom: the camera lands on (0, 0),
 * open ocean. Standing still for a whole protest is a normal recording.
 */
const MIN_SPAN_DEGREES = 0.0005;

/** Keeps the first and last fix clear of the rounded corners and of the
 * attribution sitting in the bottom bar. */
const MAP_PADDING = { top: 36, right: 36, bottom: 56, left: 36 } as const;

const RECENTER_DURATION_MS = 450;

/** Reached from the screen's header button: the camera ref has to stay
 * attached to the `Camera` in here, so the action is handed out rather than
 * the ref. */
export interface ProtestTraceMapRef {
  recenter: () => void;
}

export interface TracePoint {
  key: string;
  lat: number;
  lng: number;
  recordedAt: Date;
  /** False only for a local point whose batch hasn't landed yet. */
  synced: boolean;
}

/** What a tapped feature carries back. GeoJSON properties survive the trip
 * through native as plain JSON, so the date travels as an ISO string. */
interface PointProperties {
  key: string;
  recordedAtIso: string;
  lat: number;
  lng: number;
}

const boundsOf = (points: TracePoint[]): LngLatBounds => {
  const lngs = points.map((point) => point.lng);
  const lats = points.map((point) => point.lat);
  const [minLng, maxLng] = [Math.min(...lngs), Math.max(...lngs)];
  const [minLat, maxLat] = [Math.min(...lats), Math.max(...lats)];

  // Widened around a stationary recording so the box has an extent to fit.
  const padLng = Math.max(0, (MIN_SPAN_DEGREES - (maxLng - minLng)) / 2);
  const padLat = Math.max(0, (MIN_SPAN_DEGREES - (maxLat - minLat)) / 2);

  return [minLng - padLng, minLat - padLat, maxLng + padLng, maxLat + padLat];
};

const pointFeature = (point: TracePoint) => ({
  type: 'Feature' as const,
  id: point.key,
  properties: {
    key: point.key,
    recordedAtIso: point.recordedAt.toISOString(),
    lat: point.lat,
    lng: point.lng,
  } satisfies PointProperties,
  geometry: { type: 'Point' as const, coordinates: [point.lng, point.lat] },
});

const useTraceShape = (points: TracePoint[]) =>
  useMemo(() => {
    // Oldest first, so the line is drawn in the order it was walked.
    const ordered = [...points].sort((a, b) => a.recordedAt.getTime() - b.recordedAt.getTime());

    return {
      bounds: boundsOf(ordered),
      shape: {
        type: 'FeatureCollection' as const,
        features: [
          // Only with something to join: a one-coordinate `LineString` is
          // invalid GeoJSON, and MapLibre logs it as such rather than
          // skipping it. A single fix is a normal recording.
          ...(ordered.length > 1
            ? [
                {
                  type: 'Feature' as const,
                  properties: {},
                  geometry: {
                    type: 'LineString' as const,
                    coordinates: ordered.map((point) => [point.lng, point.lat] as [number, number]),
                  },
                },
              ]
            : []),
          // On top of the line: a straight segment between two distant fixes
          // hides how sparse the sampling was.
          ...ordered.map(pointFeature),
        ],
      },
      // Its own collection rather than a data-driven `circle-color`: an
      // expression there is rejected by the native bridge
      // (`MLRNStyle setCircleColor:`) with an NSException, which aborts the
      // app. Every `paint` value in this repo is a plain literal.
      unsent: {
        type: 'FeatureCollection' as const,
        features: ordered.filter((point) => !point.synced).map(pointFeature),
      },
    };
  }, [points]);

/**
 * The trace itself: inert as a figure, interactive on its own screen.
 *
 * A pannable map inside a `ScrollView` fights it for every vertical drag, and
 * gesture-handler's arbitration API is mid-deprecation in the installed
 * version - so panning lives on `protest-mode/[id]/trace` instead, which is
 * where the room is anyway.
 *
 * **Only one of these may be mounted at a time.** Each is a native GL
 * surface, and two alive together crashes the app - which is why the
 * full-screen view is a route rather than a modal over the figure.
 */
export const ProtestTraceMap = forwardRef<
  ProtestTraceMapRef,
  { points: TracePoint[]; interactive: boolean }
>(({ points, interactive }, ref) => {
  const { colors, theme, mode } = useTheme();
  const t = useTranslations();
  const format = useFormatter();
  const insets = useSafeAreaInsets();
  const camera = useRef<CameraRef>(null);
  const [selected, setSelected] = useState<TracePoint | null>(null);
  const { shape, unsent, bounds } = useTraceShape(points);

  const styleUrl = MAPTILER_API_KEY
    ? `${MAPTILER_STYLE_URLS[mode === 'dark' ? 'dark' : 'light']}?key=${MAPTILER_API_KEY}`
    : FALLBACK_STYLE_URL;

  const handleFeaturePress = useCallback(
    (event: { nativeEvent: { features: GeoJSON.Feature[] } }) => {
      // The line is in this source too, and it has no `key` - only a point
      // feature can be selected.
      const properties = event.nativeEvent.features
        .map((feature) => feature.properties as PointProperties | null)
        .find((entry) => entry?.key);
      if (!properties) return;

      setSelected(points.find((entry) => entry.key === properties.key) ?? null);
    },
    [points],
  );

  const recenter = useCallback(() => {
    camera.current?.fitBounds(bounds, { padding: MAP_PADDING, duration: RECENTER_DURATION_MS });
  }, [bounds]);

  useImperativeHandle(ref, () => ({ recenter }), [recenter]);

  return (
    <>
      <Map
        mapStyle={styleUrl}
        style={{ flex: 1 }}
        // On by licence, not by taste: the tiles are MapTiler's and the data
        // is OpenStreetMap's, and both require the credit to be visible.
        attribution
        attributionPosition={{ bottom: 8, right: 8 }}
        logo
        logoPosition={{ bottom: 8, left: 8 }}
        compass={false}
        scaleBar={interactive}
        dragPan={interactive}
        touchZoom={interactive}
        doubleTapZoom={interactive}
        doubleTapHoldZoom={interactive}
        // Rotation and pitch stay off even full-screen: a trajectory has no
        // use for them, and a rotated map makes "recentre" ambiguous.
        touchRotate={false}
        touchPitch={false}
        // Tapping away from a point clears the selection, which is the only
        // way back out of it.
        onPress={() => setSelected(null)}
      >
        <Camera ref={camera} initialViewState={{ bounds, padding: MAP_PADDING }} />
        <GeoJSONSource
          id="protest-trace"
          data={shape}
          onPress={interactive ? handleFeaturePress : undefined}
        >
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
              'circle-radius': 4,
              'circle-color': colors.primary,
              'circle-stroke-width': 1.5,
              'circle-stroke-color': colors.background,
            }}
          />
        </GeoJSONSource>

        {/* Drawn over the layer above, so the fixes still sitting on this
            phone stand out - the one thing the raw position list said that
            the map did not. No `onPress`: every point is already pressable
            through the source above, which holds all of them. */}
        {unsent.features.length > 0 ? (
          <GeoJSONSource id="protest-trace-unsent" data={unsent}>
            <Layer
              id="protest-trace-unsent-points"
              type="circle"
              paint={{
                'circle-radius': 4,
                'circle-color': colors.destructive,
                'circle-stroke-width': 1.5,
                'circle-stroke-color': colors.background,
              }}
            />
          </GeoJSONSource>
        ) : null}

        {selected ? (
          <GeoJSONSource
            id="protest-trace-selected"
            data={{
              type: 'Feature',
              properties: {},
              geometry: { type: 'Point', coordinates: [selected.lng, selected.lat] },
            }}
          >
            <Layer
              id="protest-trace-selected-point"
              type="circle"
              paint={{
                'circle-radius': 8,
                'circle-color': colors.foreground,
                'circle-stroke-width': 2,
                'circle-stroke-color': colors.background,
              }}
            />
          </GeoJSONSource>
        ) : null}
      </Map>

      {selected ? (
        <View
          style={{
            position: 'absolute',
            left: theme.spaces.md,
            right: theme.spaces.md,
            // Clear of the home indicator and of the attribution bar below.
            bottom: insets.bottom + theme.spaces['3xl'],
            gap: theme.spaces.xs,
            padding: theme.spaces.md,
            borderRadius: theme.border.radius.md,
            backgroundColor: colors.background,
          }}
        >
          <Text style={{ fontVariant: ['tabular-nums'], fontWeight: '600' }}>
            {format.dateTime(selected.recordedAt, {
              hour: '2-digit',
              minute: '2-digit',
              second: '2-digit',
            })}
          </Text>
          {/* Six decimals is about 10cm - more than the fix is worth, and
              exactly what someone re-plotting this elsewhere needs. */}
          <Text textColor="muted" style={{ fontVariant: ['tabular-nums'] }}>
            {`${selected.lat.toFixed(6)}, ${selected.lng.toFixed(6)}`}
          </Text>
          {!selected.synced ? (
            <Text style={{ color: colors.destructive }}>
              {t('pages.protest_mode.sessions.not_sent_yet')}
            </Text>
          ) : null}
        </View>
      ) : null}
    </>
  );
});

ProtestTraceMap.displayName = 'ProtestTraceMap';
