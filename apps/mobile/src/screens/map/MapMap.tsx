import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'expo-router';
import { useHeaderHeight } from 'expo-router/react-navigation';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Alert, Pressable, useWindowDimensions } from 'react-native';
import { useFormatter, useTranslations } from 'use-intl';
import Animated, { useAnimatedStyle } from 'react-native-reanimated';
import { GlassView } from 'expo-glass-effect';
import { Settings } from 'lucide-react-native';
import { Host, Icon } from '@expo/ui';
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
import type { NativeSyntheticEvent } from 'react-native';
import { useReportsQuery } from '@libs/query-client';
import useDebounce from '../../hooks/useDebounce';
import type { ReportsResponse } from '@libs/api-js';
import { useUIStore } from '../../stores/useUIStore';
import { useTheme } from '../../providers/ThemeProvider';
import { useLocation } from '../../providers/LocationProvider';
import { MAPTILER_API_KEY } from '../../env/common';
import { Assets } from '../../constants/assets';
import { Icons } from '../../constants/icons';
import { useMapState } from './MapState';
import { useReportsSocket } from './useReportsSocket';
import { getVisibleAreaPadding, INDEX_SHEET_INITIAL_DETENT } from './mapVisibleArea';

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

const BUTTON_GAP = 12;

const CLUSTER_SEVERITY_STOPS = {
  medium: 10,
  high: 50,
  extreme: 100,
} as const;

const MapMap = () => {
  const router = useRouter();
  const t = useTranslations();
  const format = useFormatter();
  const { theme, colors, mode, isLiquidGlassAvailable } = useTheme();
  const mapStyleVariant = useUIStore((state) => state.map.style);
  const insets = useSafeAreaInsets();
  const headerHeight = useHeaderHeight();
  const { height: windowHeight } = useWindowDimensions();
  const { sheetPosition, setOnSheetSettled } = useMapState();
  const { position } = useLocation();
  const cameraRef = useRef<CameraRef>(null);
  const reportsSourceRef = useRef<GeoJSONSourceRef>(null);
  const [bounds, setBounds] = useState<LngLatBounds | null>(null);
  const [locateMode, setLocateMode] = useState<LocateMode>('idle');

  // `initialViewState` only applies once, at mount - frozen here via
  // `useState`'s initializer so a later `position` update (the user's fix
  // just resolving, or simply moving) never yanks the camera back to it.
  const [initialCenter] = useState<[number, number]>(() =>
    position ? [position.coords.longitude, position.coords.latitude] : DEFAULT_CENTER,
  );

  // Fed into `<Map>`'s `contentInset` below - the PERSISTENT viewport
  // inset the native SDK consults continuously (compass/logo placement,
  // and crucially the locate button's `trackUserLocation` tracking, which
  // reads the map's own padding on every GPS update). `Camera`'s own
  // `padding` prop is a different, one-shot thing (added on top of this
  // for a single animated move) and doesn't affect ongoing tracking at
  // all - using it here was the bug: it nudged the camera once per sheet
  // settle regardless of tracking mode, then got silently overridden by
  // the next GPS-driven tracking update. Prefers the REAL
  // `sheetPosition.value` if it's somehow already known by the time this
  // runs - only falls back to an estimate (from the sheet's known first
  // detent, see `INDEX_SHEET_INITIAL_DETENT`) while it's still at its
  // unset default (`0`, which never happens once the sheet has actually
  // reported a position - our detents never let it cover the full
  // screen).
  const [cameraPadding, setCameraPadding] = useState(() =>
    getVisibleAreaPadding({
      headerHeight,
      windowHeight,
      sheetTop: sheetPosition.value || windowHeight * (1 - INDEX_SHEET_INITIAL_DETENT),
    }),
  );

  const mapStyleUrl = MAPTILER_API_KEY
    ? `${MAPTILER_STYLE_URLS[mapStyleVariant][mode]}?key=${MAPTILER_API_KEY}`
    : FALLBACK_STYLE_URL;

  const buttonSize = theme.input.height.md;
  const stackGap = theme.spaces.sm;
  const stackHeight = buttonSize * 2 + stackGap;

  const containerAnimatedStyle = useAnimatedStyle(() => {
    const minTop = headerHeight + BUTTON_GAP;
    const top = Math.max(sheetPosition.value - stackHeight - BUTTON_GAP, minTop);
    return { top };
  });

  // DEV-only visual of `getVisibleAreaPadding`'s rectangle - the region a
  // centered point actually lands in, not hidden under the header or the
  // live-dragged sheet. Reads `sheetPosition.value` every frame via a
  // worklet (same mechanism as `containerAnimatedStyle` above) so it
  // tracks the sheet while it's being dragged, not just at rest.
  const visibleAreaDebugStyle = useAnimatedStyle(() => ({
    top: headerHeight,
    height: Math.max(sheetPosition.value - headerHeight, 0),
  }));

  const handleRegionDidChange = useCallback((event: { nativeEvent: { bounds: LngLatBounds } }) => {
    setBounds(event.nativeEvent.bounds);
  }, []);

  // No position, no tracking - if it drops away mid-session (permission
  // revoked, GPS lost), fall back out of whichever mode was active.
  // Adjusted during render (React's documented pattern for resetting state
  // when a prop/value changes), not in an effect - no extra render pass
  // just to flip this back to idle.
  const [hadPosition, setHadPosition] = useState(!!position);
  if (!!position !== hadPosition) {
    setHadPosition(!!position);
    if (!position) setLocateMode('idle');
  }

  // Cycles idle -> focused -> heading -> idle. Just flips the state;
  // `trackUserLocation` below (a native MapLibre feature, not a manual
  // `easeTo`) handles the actual "lock onto and fly to the user" move and
  // the continuous heading-follow rotation.
  const handleLocatePress = useCallback(() => {
    if (!position) return;
    setLocateMode((current) => {
      const next = NEXT_LOCATE_MODE[current];
      // Refreshes the padding right as tracking engages (idle -> focused):
      // while idle, a sheet resize doesn't update it (see `onSheetSettled`
      // above), so it could otherwise still reflect a detent from before
      // this tap.
      if (current === 'idle' && next !== 'idle') {
        setCameraPadding(
          getVisibleAreaPadding({ headerHeight, windowHeight, sheetTop: sheetPosition.value }),
        );
      }
      return next;
    });
  }, [position, headerHeight, windowHeight, sheetPosition]);

  // MapLibre's own tracking modes cancel themselves on a user-driven
  // gesture and report it here with `trackUserLocation: null` - no need to
  // detect "the user panned/zoomed" ourselves.
  const handleTrackUserLocationChange = useCallback(
    (event: NativeSyntheticEvent<TrackUserLocationChangeEvent>) => {
      if (event.nativeEvent.trackUserLocation === null) {
        setLocateMode('idle');
      }
    },
    [],
  );

  // Keeps the camera's padding in sync whenever the sheet settles on a new
  // detent - but only while a tracking mode is active. `contentInset`
  // affects what the map considers "centered" even in `idle` (changing it
  // shifts which pixel the current center coordinate sits at), so updating
  // it with nothing driving the camera would visibly nudge the map for no
  // reason - only `focused`/`heading` should react to the sheet resizing.
  // Registers via `setOnSheetSettled` (state), not a ref mutated directly -
  // the React Compiler rejects mutating a ref that didn't originate from a
  // local `useRef` ("may reassign or mutate `onSheetSettled` after render
  // ... consider using state instead", which is exactly what this is).
  useEffect(() => {
    setOnSheetSettled(() => () => {
      if (locateMode === 'idle') return;
      setCameraPadding(
        getVisibleAreaPadding({ headerHeight, windowHeight, sheetTop: sheetPosition.value }),
      );
    });
  }, [headerHeight, windowHeight, sheetPosition, setOnSheetSettled, locateMode]);

  const rawBbox = useMemo(() => {
    if (!bounds) return undefined;
    const [west, south, east, north] = bounds;
    return { minLat: south, minLng: west, maxLat: north, maxLng: east };
  }, [bounds]);
  const bbox = useDebounce(rawBbox, 500);

  const reportsQuery = useReportsQuery(bbox);
  useReportsSocket(bbox);

  const reportsFeatureCollection = useMemo(() => {
    const reports: ReportsResponse[] = reportsQuery.data ?? [];
    return {
      type: 'FeatureCollection' as const,
      features: reports.map((report) => ({
        type: 'Feature' as const,
        id: report.id,
        properties: { id: report.id, type: report.type, occurredAt: report.occurredAt },
        geometry: { type: 'Point' as const, coordinates: [report.lng, report.lat] },
      })),
    };
  }, [reportsQuery.data]);

  const handleReportsPress = useCallback(
    async (event: NativeSyntheticEvent<PressEventWithFeatures>) => {
      const feature = event.nativeEvent.features[0];
      if (!feature) return;

      const properties = (feature.properties ?? {}) as Record<string, unknown>;

      if (properties.cluster) {
        const clusterId = properties.cluster_id as number;
        const expansionZoom = await reportsSourceRef.current?.getClusterExpansionZoom(clusterId);
        if (expansionZoom === undefined || feature.geometry.type !== 'Point') return;
        const [lng, lat] = feature.geometry.coordinates as [number, number];
        cameraRef.current?.flyTo({ center: [lng, lat], zoom: expansionZoom, duration: 500 });
        return;
      }

      const reportType = properties.type as string | undefined;
      const occurredAt = properties.occurredAt as string | undefined;
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
        Alert.alert(t(`pages.map.report.types.${reportType}`), formattedOccurredAt);
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
        <Images images={{ ...Assets.reports, ...Assets.clusterSeverity }} />
        <GeoJSONSource
          id="reports"
          ref={reportsSourceRef}
          data={reportsFeatureCollection}
          cluster
          clusterRadius={50}
          clusterMaxZoom={14}
          onPress={handleReportsPress}
        >
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
              'icon-size': ['interpolate', ['linear'], ['zoom'], 10, 0.025, 14, 0.045, 18, 0.08],
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
          <Layer
            id="reports-unclustered"
            type="symbol"
            filter={['!', ['has', 'point_count']]}
            layout={{
              'icon-image': ['get', 'type'],
              'icon-size': ['interpolate', ['linear'], ['zoom'], 10, 0.017, 14, 0.033, 18, 0.067],
              'icon-allow-overlap': true,
            }}
          />
        </GeoJSONSource>
      </Map>
      {__DEV__ && (
        <Animated.View
          pointerEvents="none"
          style={[
            { position: 'absolute', left: 0, right: 0, backgroundColor: 'rgba(255, 0, 0, 0.25)' },
            visibleAreaDebugStyle,
          ]}
        />
      )}
      <Animated.View
        style={[
          {
            position: 'absolute',
            right: insets.right + theme.spaces.horizontal,
            gap: stackGap,
          },
          containerAnimatedStyle,
        ]}
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
        <Pressable onPress={() => router.push('/map/settings')}>
          <GlassView style={circleStyle}>
            <Settings color={colors.foreground} size={theme.icons.sizes.md} />
          </GlassView>
        </Pressable>
      </Animated.View>
    </>
  );
};

export default MapMap;
