import { useMemo } from 'react';

const useRandomBackdrop = (backdrops: (string | null | undefined)[]) => {
  // Intentionally impure: picks one random backdrop per distinct `backdrops` array,
  // memoized so it stays stable across re-renders instead of changing every render.
  /* eslint-disable react-hooks/purity */
  const randomBackdrop = useMemo(() => {
    const images = backdrops.filter((backdrop) => backdrop !== undefined) as string[];
    if (!images.length) return undefined;
    return images[Math.floor(Math.random() * images.length)];
  }, [backdrops]);
  /* eslint-enable react-hooks/purity */

  return randomBackdrop;
};

export default useRandomBackdrop;
