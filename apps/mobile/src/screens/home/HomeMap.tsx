import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  Alert,
  Pressable,
  View,
  type LayoutChangeEvent,
  type NativeSyntheticEvent,
} from 'react-native';
import { useFormatter, useTranslations } from 'use-intl';
import { GlassView } from 'expo-glass-effect';
import { Settings, TriangleAlert } from 'lucide-react-native';
import { Host, Icon, RNHostView } from '@expo/ui';
import { buttonStyle, controlSize, frame, tint } from '@expo/ui/swift-ui/modifiers';
import { fillMaxSize } from '@expo/ui/jetpack-compose/modifiers';
import {
  Map,
  Camera,
  UserLocation,
  GeoJSONSource,
  Images,
  Layer,
  type CameraRef,
  type GeoJSONSourceRef,
  type LngLatBounds,
  type PressEventWithFeatures,
  type TrackUserLocation,
  type TrackUserLocationChangeEvent,
} from '@maplibre/maplibre-react-native';
import { reportsOptions } from '@libs/query-client';
import { useReportsSocket } from './useReportsSocket';
import useDebounce from '../../hooks/useDebounce';
import { useObservable } from '../../hooks/useObservable';
import { observeAllReports } from '../../lib/watermelon/reports';
import { groupReports } from '../../lib/watermelon/grouping';
import type { Report } from '../../lib/watermelon/models/Report';
import type { ReportsResponse } from '@libs/api-js';
import { useUIStore } from '../../stores/useUIStore';
import { useTheme } from '../../providers/ThemeProvider';
import { useLocation } from '../../providers/LocationProvider';
import { MAPTILER_API_KEY } from '../../env/common';
import { mapSprites } from '../../constants/assets';
import { Icons } from '../../constants/icons';
import { Breakpoints } from '../../constants/breakpoints';
import { Text } from '../../components/ui/text';
import { Icon as RNIcon } from '../../components/ui/icon';
import { NativeButton } from '../../components/ui/NativeButton';
import { useQuery } from '@tanstack/react-query';

/**
 * The locate button's 3 states, cycled on each tap - same idea as Apple/
 * Google Maps' own locate button:
 * - `idle`: neutral, not tracking.
 * - `focused`: locked and centered on the user, but bearing stays as-is.
 * - `heading`: also rotates the map to match the device's compass heading.
 *
 * Any user-driven pan/zoom while `focused` or `heading` drops back to
 * `idle` - handled by MapLibre itself (`onTrackUserLocationChange` fires
 * with `null` when its own gesture-cancels-tracking behavior kicks in), not
 * something this screen has to detect manually.
 */
type LocateMode = 'idle' | 'focused' | 'heading';

const NEXT_LOCATE_MODE: Record<LocateMode, LocateMode> = {
  idle: 'focused',
  focused: 'heading',
  heading: 'idle',
};

const TRACK_USER_LOCATION: Record<LocateMode, TrackUserLocation | undefined> = {
  idle: undefined,
  focused: 'default',
  heading: 'heading',
};

const LOCATE_ICON: Record<LocateMode, (typeof Icons)['locate']> = {
  idle: Icons.locate,
  focused: Icons.locateFocused,
  heading: Icons.locateHeading,
};

const FALLBACK_STYLE_URL = 'https://demotiles.maplibre.org/style.json';
const MAPTILER_STYLE_URLS = {
  default: {
    light: 'https://api.maptiler.com/maps/streets-v2/style.json',
    dark: 'https://api.maptiler.com/maps/streets-v2-dark/style.json',
  },
  satellite: {
    light: 'https://api.maptiler.com/maps/satellite/style.json',
    dark: 'https://api.maptiler.com/maps/satellite/style.json',
  },
} as const;

const DEFAULT_CENTER: [number, number] = [2.3522, 48.8566];

// Mirrors the API's own `REPORT_TTL_HOURS` (apps/api/src/app/reports/
// handlers.rs) - local reports have no expiry of their own, so without
// this a not-yet/never-synced row would render as a pin forever.
const REPORT_TTL_MS = 6 * 60 * 60 * 1000;

/** Matches `SIZE` in scripts/render-report-icons.ts - only used by the dev
 * overlay, to show what the sprite atlas actually costs on the GPU. */
const SPRITE_PX = 128;

// Clustering is off (see the GeoJSONSource below): a single count can't
// speak for a group that mixes `live_ammunition` with `safe_route`, so the
// severity tiers have nothing meaningful to scale.
// const CLUSTER_SEVERITY_STOPS = {
//   medium: 10,
//   high: 50,
//   extreme: 100,
// } as const;

/**
 * The Home tab's live map - reports (server + local/mesh-pending, grouped
 * by type/proximity) rendered one marker per report, plus the locate and
 * report-creation controls. No bottom sheet on this screen, so camera
 * padding/button placement are plain fixed reserves (`cameraPadding`)
 * rather than anything tracking a draggable sheet position.
 */

/**
 * What the map is actually being handed, which is the thing that is hard to
 * guess from the outside. Added after a stall that looked like too much data
 * and was in fact a 35 MB sprite atlas - `sprites` is here so that cost is
 * visible rather than inferred.
 *
 * `heap` is the JS side only. The sprite atlas, the tile cache and the layer's
 * own buffers all live in native memory, which JS cannot see - read those in
 * Xcode's memory graph, not here.
 */
/** Hermes' own heap accounting; absent on JSC and on web. */
const jsHeapMB = (): number | undefined => {
  const stats = (
    global as unknown as {
      HermesInternal?: { getInstrumentedStats?: () => Record<string, number> };
    }
  ).HermesInternal?.getInstrumentedStats?.();
  const bytes = stats?.js_heapSize;
  return typeof bytes === 'number' ? bytes / 1024 / 1024 : undefined;
};

const MapDebugOverlay = ({
  features,
  bbox,
}: {
  features: { properties: { kind?: string; count: number } }[];
  bbox: { minLat: number; minLng: number; maxLat: number; maxLng: number } | undefined;
}) => {
  const insets = useSafeAreaInsets();
  const { theme } = useTheme();
  // Sampled on a timer rather than per render: the heap moving while nothing
  // on screen changes is exactly the signal worth seeing.
  const [heapMB, setHeapMB] = useState(jsHeapMB);
  useEffect(() => {
    const id = setInterval(() => setHeapMB(jsHeapMB), 1000);
    return () => clearInterval(id);
  }, []);
  const stats = useMemo(() => {
    let covered = 0;
    let families = 0;
    let biggest = 0;
    for (const feature of features) {
      covered += feature.properties.count;
      if (feature.properties.kind === 'family') families++;
      if (feature.properties.count > biggest) biggest = feature.properties.count;
    }
    // Metres per degree of longitude at Paris' latitude; good enough to read a
    // viewport width off, not a geodesy result.
    const spanM = bbox ? (bbox.maxLng - bbox.minLng) * 111_320 * 0.658 : 0;
    return { covered, families, biggest, spanM };
  }, [features, bbox]);

  return (
    <View
      pointerEvents="none"
      style={{
        position: 'absolute',
        left: insets.left + theme.spaces.horizontal,
        top: insets.top + theme.spaces.vertical,
        padding: 6,
        borderRadius: 4,
        backgroundColor: 'rgba(0,0,0,0.65)',
      }}
    >
      <Text style={{ color: '#fff', fontSize: 10, fontVariant: ['tabular-nums'] }}>
        {`${features.length} markers · ${stats.covered} reports · max ${stats.biggest}`}
      </Text>
      <Text style={{ color: '#fff', fontSize: 10, fontVariant: ['tabular-nums'] }}>
        {`${stats.families} family / ${features.length - stats.families} type · viewport ${Math.round(stats.spanM)}m`}
      </Text>
      <Text style={{ color: '#fff', fontSize: 10, fontVariant: ['tabular-nums'] }}>
        {`${Object.keys(mapSprites).length} sprites · atlas ${((Object.keys(mapSprites).length * SPRITE_PX * SPRITE_PX * 4) / 1024 / 1024).toFixed(1)}MB`}
      </Text>
      <Text style={{ color: '#fff', fontSize: 10, fontVariant: ['tabular-nums'] }}>
        {heapMB === undefined ? 'js heap n/a' : `js heap ${heapMB.toFixed(1)}MB`}
      </Text>
    </View>
  );
};

const HomeMap = () => {
  const router = useRouter();
  const t = useTranslations();
  const format = useFormatter();
  const { theme, colors, mode, isLiquidGlassAvailable } = useTheme();
  const mapStyleVariant = useUIStore((state) => state.map.style);
  const insets = useSafeAreaInsets();
  const { position } = useLocation();
  const cameraRef = useRef<CameraRef>(null);
  const reportsSourceRef = useRef<GeoJSONSourceRef>(null);
  const [bounds, setBounds] = useState<LngLatBounds | null>(null);
  const [locateMode, setLocateMode] = useState<LocateMode>('idle');
  // Guessed up front (matches the Host's own fixed height below) so the
  // very first render already reserves roughly the right space - the real,
  // measured value from `onLayout` takes over as soon as it fires.
  const [footerHeight, setFooterHeight] = useState<number>(() => theme.input.height.lg);
  const handleFooterLayout = useCallback((event: LayoutChangeEvent) => {
    setFooterHeight(event.nativeEvent.layout.height);
  }, []);

  const [initialCenter] = useState<[number, number]>(() =>
    position ? [position.coords.longitude, position.coords.latitude] : DEFAULT_CENTER,
  );

  // This screen mounts immediately at app launch, before GPS has
  // necessarily had time to resolve - `position` is often still
  // `undefined` on that very first render, so `initialCenter` above
  // freezes in `DEFAULT_CENTER`. This recenters once, the first time a
  // real position actually arrives after mount, instead of leaving the
  // map stuck on the Paris fallback.
  const hasCenteredOnPosition = useRef(false);
  useEffect(() => {
    if (!position || hasCenteredOnPosition.current) return;
    hasCenteredOnPosition.current = true;
    cameraRef.current?.flyTo({
      center: [position.coords.longitude, position.coords.latitude],
      zoom: 12,
      duration: 0,
    });
  }, [position]);

  const buttonSize = theme.input.height.md;
  const reportButtonHeight = theme.input.height.lg;
  const stackGap = theme.spaces.sm;

  // No header on this screen (see `(tabs)/(home)/_layout.tsx`) - `insets.top`
  // is the only top reservation needed. The native tab bar isn't a separate
  // term here: it already consumes/extends `insets.bottom` itself (it's a
  // real `UITabBarController`/bottom nav, not a JS-rendered overlay), so
  // the bottom reserve is just the footer button's own (measured) height
  // plus one gap above the safe area - nothing here drags, so this only
  // needs recomputing when insets/footer height actually change.
  const cameraPadding = useMemo(
    () => ({
      top: insets.top + theme.spaces.md,
      left: 0,
      right: 0,
      bottom: insets.bottom + footerHeight + theme.spaces.md,
    }),
    [insets.top, insets.bottom, footerHeight, theme.spaces.md],
  );

  const mapStyleUrl = MAPTILER_API_KEY
    ? `${MAPTILER_STYLE_URLS[mapStyleVariant][mode]}?key=${MAPTILER_API_KEY}`
    : FALLBACK_STYLE_URL;

  const handleRegionDidChange = useCallback((event: { nativeEvent: { bounds: LngLatBounds } }) => {
    setBounds(event.nativeEvent.bounds);
  }, []);

  const [hadPosition, setHadPosition] = useState(!!position);
  if (!!position !== hadPosition) {
    setHadPosition(!!position);
    if (!position) setLocateMode('idle');
  }

  const handleLocatePress = useCallback(() => {
    if (!position) return;
    setLocateMode((current) => NEXT_LOCATE_MODE[current]);
  }, [position]);

  const handleTrackUserLocationChange = useCallback(
    (event: NativeSyntheticEvent<TrackUserLocationChangeEvent>) => {
      if (event.nativeEvent.trackUserLocation === null) {
        setLocateMode('idle');
      }
    },
    [],
  );

  const handleReportButtonPress = useCallback(() => {
    router.push('/report');
  }, [router]);

  const rawBbox = useMemo(() => {
    if (!bounds) return undefined;
    const [west, south, east, north] = bounds;
    return { minLat: south, minLng: west, maxLat: north, maxLng: east };
  }, [bounds]);
  const bbox = useDebounce(rawBbox, 500);

  const reportsQuery = useQuery({
    ...reportsOptions(bbox ?? { minLat: 0, minLng: 0, maxLat: 0, maxLng: 0 }),
    enabled: !!bbox,
  });
  useReportsSocket(bbox);

  const getLocalReports = useCallback(() => observeAllReports(), []);
  const localReports = useObservable(getLocalReports, [] as Report[]);

  const [mountedAt] = useState(() => Date.now());

  const reportsFeatureCollection = useMemo(() => {
    const serverReports: ReportsResponse[] = reportsQuery.data ?? [];
    const serverIds = new Set(serverReports.map((report) => report.id));
    const ttlCutoff = mountedAt - REPORT_TTL_MS;

    const localOnlyReports = localReports.filter((report) => {
      if (serverIds.has(report.id)) return false;
      if (report.occurredAt.getTime() < ttlCutoff) return false;
      if (!bbox) return true;
      return (
        report.lat >= bbox.minLat &&
        report.lat <= bbox.maxLat &&
        report.lng >= bbox.minLng &&
        report.lng <= bbox.maxLng
      );
    });

    // Same viewport the server grouped against, so local and confirmed
    // markers collapse at the same rate instead of looking like two systems.
    // No camera yet means no viewport to scale the grid to: an empty span
    // floors at `MIN_CELL_DEGREES`, which collapses nothing.
    const localOnlyGroups = groupReports(localOnlyReports, bbox ?? { minLng: 0, maxLng: 0 });

    return {
      type: 'FeatureCollection' as const,
      features: [
        ...serverReports.map((report) => ({
          type: 'Feature' as const,
          id: report.id,
          properties: {
            id: report.id,
            type: report.type,
            kind: report.kind ?? 'type',
            // A family marker's `type` is a family key, for which there is no
            // sprite of that name - `other` is also a key at both levels, so
            // the prefix is what keeps the two apart.
            icon: report.kind === 'family' ? `family_${report.type}` : report.type,
            occurredAt: report.occurredAt,
            count: report.count,
          },
          geometry: { type: 'Point' as const, coordinates: [report.lng, report.lat] },
        })),
        ...localOnlyGroups.map((group) => ({
          type: 'Feature' as const,
          id: group.id,
          properties: {
            id: group.id,
            type: group.type,
            kind: group.kind,
            icon: group.kind === 'family' ? `family_${group.type}` : group.type,
            occurredAt: group.occurredAt.toISOString(),
            count: group.count,
          },
          geometry: { type: 'Point' as const, coordinates: [group.lng, group.lat] },
        })),
      ],
    };
  }, [reportsQuery.data, localReports, bbox, mountedAt]);

  const handleReportsPress = useCallback(
    async (event: NativeSyntheticEvent<PressEventWithFeatures>) => {
      const feature = event.nativeEvent.features[0];
      if (!feature) return;

      const properties = (feature.properties ?? {}) as Record<string, unknown>;

      // No clusters to expand while clustering is off.
      // if (properties.cluster) {
      //   const clusterId = properties.cluster_id as number;
      //   const expansionZoom = await reportsSourceRef.current?.getClusterExpansionZoom(clusterId);
      //   if (expansionZoom === undefined || feature.geometry.type !== 'Point') return;
      //   const [lng, lat] = feature.geometry.coordinates as [number, number];
      //   cameraRef.current?.flyTo({ center: [lng, lat], zoom: expansionZoom, duration: 500 });
      //   return;
      // }

      const reportType = properties.type as string | undefined;
      const isFamily = properties.kind === 'family';
      const occurredAt = properties.occurredAt as string | undefined;
      const count = (properties.count as number | undefined) ?? 1;
      if (reportType) {
        const formattedOccurredAt = occurredAt
          ? format.dateTime(new Date(occurredAt), {
              weekday: 'long',
              day: 'numeric',
              month: 'long',
              hour: '2-digit',
              minute: '2-digit',
            })
          : undefined;
        const countLine = count > 1 ? t('pages.map.report.count', { count }) : undefined;
        const message = [formattedOccurredAt, countLine].filter(Boolean).join('\n') || undefined;
        // A clustered marker's `type` is a family key when `kind` says so, and
        // the two live in different dictionaries - looking a family up under
        // `types` is what produced MISSING_MESSAGE on screen.
        const titleKey = (
          isFamily
            ? `pages.map.report.families.${reportType}`
            : `pages.map.report.types.${reportType}`
        ) as Parameters<typeof t.has>[0];
        Alert.alert(t.has(titleKey) ? t(titleKey) : reportType, message);
      }
    },
    [t, format],
  );

  const circleStyle = {
    width: buttonSize,
    height: buttonSize,
    borderRadius: theme.border.radius.full,
    alignItems: 'center' as const,
    justifyContent: 'center' as const,
    backgroundColor: !isLiquidGlassAvailable ? colors.muted : 'transparent',
    borderWidth: !isLiquidGlassAvailable ? 1 : 0,
    borderColor: !isLiquidGlassAvailable ? colors.border : 'transparent',
  };

  return (
    <>
      <Map
        mapStyle={mapStyleUrl}
        style={{ flex: 1 }}
        compass
        scaleBar
        contentInset={cameraPadding}
        onRegionDidChange={handleRegionDidChange}
        attribution={false}
      >
        <Camera
          ref={cameraRef}
          initialViewState={{ center: initialCenter, zoom: 12 }}
          trackUserLocation={TRACK_USER_LOCATION[locateMode]}
          onTrackUserLocationChange={handleTrackUserLocationChange}
        />
        <UserLocation />
        <Images images={mapSprites} />
        <GeoJSONSource
          id="reports"
          ref={reportsSourceRef}
          data={reportsFeatureCollection}
          // Clustering disabled: a cluster bubble would average hazards and
          // safe spots into one number. Re-enable here together with the
          // `reports-clusters` layer below if it ever earns its place.
          // cluster
          // clusterRadius={50}
          // clusterMaxZoom={14}
          onPress={handleReportsPress}
        >
          {/* Cluster layer, disabled with the source options above. A
              count over a group that mixes hazards and safe spots says
              nothing useful, so there is no severity to render.

          <Layer
            id="reports-clusters"
            type="symbol"
            filter={['has', 'point_count']}
            layout={{
              'icon-image': [
                'step',
                ['get', 'point_count'],
                Assets.clusterSeverity.low,
                CLUSTER_SEVERITY_STOPS.medium,
                Assets.clusterSeverity.medium,
                CLUSTER_SEVERITY_STOPS.high,
                Assets.clusterSeverity.high,
                CLUSTER_SEVERITY_STOPS.extreme,
                Assets.clusterSeverity.extreme,
              ],
              'icon-size': ['interpolate', ['linear'], ['zoom'], -14, 0.1, 18, 0.2],
              // 'icon-size': ['interpolate', ['linear'], ['zoom'], 10, 0.025, 14, 0.045, 18, 0.08],
              'icon-allow-overlap': true,
              'text-field': ['get', 'point_count'],
              'text-size': 11,
              'text-offset': [0, 1.3],
              'text-allow-overlap': true,
            }}
            paint={{
              'text-color': colors.foreground,
              'text-halo-color': colors.background,
              'text-halo-width': 1.5,
            }}
          />
          */}

          <Layer
            id="reports-unclustered"
            type="symbol"
            // filter={['!', ['has', 'point_count']]}
            layout={{
              // A plain property lookup, never an expression: `icon-image`
              // wants a resolvedImage, and a `case`/`concat` producing a
              // string does not reliably coerce to one - it renders nothing at
              // all rather than falling back. The sprite name is resolved in
              // JS where the feature is built.
              'icon-image': ['get', 'icon'],
              // On-screen size is `source px * icon-size`, and the sprites are
              // 128 (see scripts/render-report-icons.ts) - so these are 51 and
              // 102 px. Both numbers move together: re-rendering at a
              // different size without recalibrating here resizes every
              // marker on the map.
              'icon-size': ['interpolate', ['linear'], ['zoom'], 14, 0.4, 18, 0.8],
              // 'icon-size': ['interpolate', ['linear'], ['zoom'], 10, 0.04, 14, 0.066, 18, 0.094],
              'icon-allow-overlap': true,
            }}
          />
        </GeoJSONSource>
      </Map>

      {__DEV__ && (
        <View
          pointerEvents="none"
          style={{
            position: 'absolute',
            left: 0,
            right: 0,
            top: cameraPadding.top,
            bottom: cameraPadding.bottom,
            backgroundColor: 'rgba(255, 0, 0, 0.25)',
          }}
        />
      )}

      {__DEV__ && <MapDebugOverlay features={reportsFeatureCollection.features} bbox={bbox} />}

      <View
        style={{
          position: 'absolute',
          top: insets.top + theme.spaces.md,
          right: insets.right + theme.spaces.horizontal,
          gap: stackGap,
        }}
      >
        <Pressable onPress={handleLocatePress}>
          <GlassView style={circleStyle}>
            <Host style={{ width: theme.icons.sizes.md, height: theme.icons.sizes.md }}>
              <Icon
                name={position ? LOCATE_ICON[locateMode] : Icons.locateUnavailable}
                size={theme.icons.sizes.md}
                color={position ? colors.foreground : colors.mutedForeground}
              />
            </Host>
          </GlassView>
        </Pressable>
        <Pressable onPress={() => router.push('/settings-map')}>
          <GlassView style={circleStyle}>
            <Settings color={colors.foreground} size={theme.icons.sizes.md} />
          </GlassView>
        </Pressable>
      </View>

      <View
        onLayout={handleFooterLayout}
        style={{
          position: 'absolute',
          left: insets.left + theme.spaces.horizontal,
          right: insets.right + theme.spaces.horizontal,
          bottom: insets.bottom + theme.spaces.md,
          alignItems: 'center',
        }}
      >
        {/* Both axes are pinned to a concrete number on the `Host` (width
            via `100%`, height via a fixed value) - `RNHostView`'s default
            (non-`matchContents`) sizing fills whatever box the button ends
            up with, and that box is only unambiguous (no SwiftUI<->Yoga
            measurement race, which drops the label/lets the icon spill
            out otherwise) when neither axis is left to "shrink to
            content". Capped at `Breakpoints.sm` and centered so it
            doesn't stretch edge-to-edge on a tablet. */}
        <Host style={{ width: '100%', maxWidth: Breakpoints.sm, height: reportButtonHeight }}>
          <NativeButton
            onPress={handleReportButtonPress}
            colors={{ containerColor: colors.warning, contentColor: colors.warningForeground }}
            iosModifiers={[
              // 'glass'/'glassProminent' only exist on iOS 26+ - below
              // that, @expo/ui silently drops the style, leaving the
              // button with no fill at all (just the label). 'bordered
              // Prominent' is the pre-26 equivalent that `tint` still
              // fills correctly.
              buttonStyle(isLiquidGlassAvailable ? 'glassProminent' : 'borderedProminent'),
              controlSize('extraLarge'),
              tint(colors.warning),
              frame({ maxWidth: Infinity, maxHeight: Infinity }),
            ]}
            androidModifiers={[fillMaxSize()]}
          >
            <RNHostView>
              <View
                style={{
                  flex: 1,
                  flexDirection: 'row',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: theme.spaces.sm,
                }}
              >
                <RNIcon
                  name={TriangleAlert}
                  color={colors.warningForeground}
                  size={theme.icons.sizes.md}
                />
                <Text style={{ color: colors.warningForeground }}>{t('messages.report')}</Text>
              </View>
            </RNHostView>
          </NativeButton>
        </Host>
      </View>
    </>
  );
};

export default HomeMap;
