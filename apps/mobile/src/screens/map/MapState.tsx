import { createContext, useContext, useState, type Dispatch, type SetStateAction } from 'react';
import { useSharedValue, type SharedValue } from 'react-native-reanimated';

interface MapStateValue {
  /**
   * The `index` sheet's current Y position on screen (its top edge, in
   * points - smaller as the sheet expands upward), shared between
   * `MapLayout` (where TrueSheet's `positionChangeHandler` worklet writes
   * to it) and `MapMap` (where the floating settings button reads it to
   * follow the sheet, and `getVisibleAreaPadding` uses it to keep camera
   * moves out from under the sheet).
   */
  sheetPosition: SharedValue<number>;
  /**
   * `MapMap`'s own "the sheet just settled" handler, called by `MapLayout`
   * whenever the sheet settles on a new detent, so `MapMap` can re-align
   * the camera's padding to the newly available visible area (e.g. while
   * the locate button's tracking mode is active).
   *
   * State, not a ref: `MapMap` registering its handler via a ref mutated
   * inside a `useEffect` - a ref it doesn't itself own with `useRef`, just
   * received through this context - is exactly the pattern the React
   * Compiler's effect-mutation check rejects ("may reassign or mutate
   * `onSheetSettled` after render ... consider using state instead", which
   * is what this is now).
   */
  onSheetSettled: (() => void) | null;
  setOnSheetSettled: Dispatch<SetStateAction<(() => void) | null>>;
}

const MapStateContext = createContext<MapStateValue | undefined>(undefined);

export const useMapStateValue = (): MapStateValue => {
  const sheetPosition = useSharedValue(0);
  const [onSheetSettled, setOnSheetSettled] = useState<(() => void) | null>(null);
  return { sheetPosition, onSheetSettled, setOnSheetSettled };
};

export const MapStateProvider = MapStateContext.Provider;

export const useMapState = () => {
  const context = useContext(MapStateContext);
  if (context === undefined) {
    throw new Error('useMapState must be used within the map layout');
  }
  return context;
};
