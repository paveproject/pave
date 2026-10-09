import type { NativeStackHeaderItem } from 'expo-router';

/** Shared return shape for all useXHeaderMenu hooks (movie, tv series, ...). */
export interface HeaderMenuReturn {
  onMenuPress: () => void;
  headerRightItems: (() => NativeStackHeaderItem[]) | undefined;
}
