import type { ViewPadding } from '@maplibre/maplibre-react-native';

/**
 * The `index` sheet's first detent (see `MapLayout.tsx`'s `detents` array)
 * - shared here so `MapMap.tsx` can estimate the sheet's initial height
 * for the camera's one-shot `initialViewState`, before the sheet has
 * actually presented and reported a real `sheetPosition`.
 */
export const INDEX_SHEET_INITIAL_DETENT = 0.33;

interface VisibleAreaParams {
  /** Height of the (transparent) native header covering the top of the map. */
  headerHeight: number;
  /** `useWindowDimensions().height` - the full screen height the map fills. */
  windowHeight: number;
  /**
   * The bottom sheet's current top edge, in screen points (see
   * `MapState.tsx`) - everything below this line is covered by the sheet,
   * regardless of which detent it's currently resting at.
   */
  sheetTop: number;
}

/**
 * The region of the map that isn't covered by the header or the bottom
 * sheet - the only part of the screen a user can actually see a point
 * land on. Feed this straight into `CameraRef.flyTo`/`easeTo`'s `padding`
 * option (a native MapLibre camera feature, not a manual offset
 * calculation) whenever centering on a coordinate, exactly like Apple/
 * Google Maps keep the focal point out from under their own bottom sheet.
 */
export const getVisibleAreaPadding = ({
  headerHeight,
  windowHeight,
  sheetTop,
}: VisibleAreaParams): ViewPadding => ({
  top: headerHeight,
  bottom: Math.max(windowHeight - sheetTop, 0),
  left: 0,
  right: 0,
});
