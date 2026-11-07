import { useCallback, useRef } from 'react';
import { View, type GestureResponderEvent } from 'react-native';
import type { ReactNode } from 'react';

/** Enough of a change to be worth a render: `zoom` is a React prop, so every
 * step is a JS round-trip to the native view. */
const ZOOM_EPSILON = 0.004;

/** How far the fingers have to travel for the full range. A pinch to double
 * the distance moves zoom by half of it. */
const SENSITIVITY = 0.5;

const distance = (event: GestureResponderEvent): number | null => {
  const touches = event.nativeEvent.touches;
  if (touches.length < 2) return null;
  const [a, b] = touches;
  return Math.hypot(a.pageX - b.pageX, a.pageY - b.pageY);
};

/**
 * Pinch-to-zoom over a native camera preview.
 *
 * React Native's own responder props rather than Gesture Handler, for the
 * same reason as `Scrubber`: in the installed version (3.3) `GestureDetector`
 * is not exported from the package index.
 *
 * `zoom` has to stay React state because it is a prop on `CameraView`, so the
 * value is only pushed when it actually moves - a pinch otherwise re-renders
 * the tree on every touch frame. Hence reading it from props rather than a
 * ref: the comparison wants the last *committed* zoom, and a ref written
 * during render is rejected by the react-compiler lint anyway.
 */
export const PinchZoom = ({
  zoom,
  onZoom,
  children,
}: {
  zoom: number;
  onZoom: (zoom: number) => void;
  children: ReactNode;
}) => {
  const baseline = useRef<{ distance: number; zoom: number } | null>(null);

  const onMove = useCallback(
    (event: GestureResponderEvent) => {
      const spread = distance(event);
      // A single finger is not a pinch - and lifting one finger of two has to
      // re-baseline, or the remaining touch jumps the zoom.
      if (spread === null) {
        baseline.current = null;
        return;
      }
      if (!baseline.current) {
        baseline.current = { distance: spread, zoom };
        return;
      }
      const ratio = spread / baseline.current.distance;
      const next = Math.min(1, Math.max(0, baseline.current.zoom + (ratio - 1) * SENSITIVITY));
      if (Math.abs(next - zoom) >= ZOOM_EPSILON) onZoom(next);
    },
    [onZoom, zoom],
  );

  return (
    <View
      style={{ flex: 1 }}
      onStartShouldSetResponder={() => true}
      onMoveShouldSetResponder={() => true}
      onResponderMove={onMove}
      onResponderRelease={() => {
        baseline.current = null;
      }}
      onResponderTerminate={() => {
        baseline.current = null;
      }}
    >
      {children}
    </View>
  );
};
