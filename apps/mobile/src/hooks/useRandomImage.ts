import { useMemo } from 'react';
import { ImageSourcePropType } from 'react-native';

export function useRandomImage<T extends string | ImageSourcePropType>(images: T[]): T | undefined {
  // Intentionally impure: picks one random image per distinct `images` array,
  // memoized so it stays stable across re-renders instead of changing every render.
  /* eslint-disable react-hooks/purity */
  const image = useMemo(() => {
    if (!images.length) return undefined;

    const idx = Math.floor(Math.random() * images.length);
    return images[idx];
  }, [images]);
  /* eslint-enable react-hooks/purity */

  return image;
}
