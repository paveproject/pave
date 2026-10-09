import * as React from 'react';
import { Platform } from 'react-native';

const useIsomorphicLayoutEffect =
  Platform.OS === 'web' && typeof window === 'undefined' ? React.useEffect : React.useLayoutEffect;

export { useIsomorphicLayoutEffect };
