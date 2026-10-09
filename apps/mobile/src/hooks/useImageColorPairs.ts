import { useState, useEffect } from 'react';
import ImageColors, { ImageColorsResult } from 'react-native-image-colors';

export type ColorPair = { top: string; bottom: string };

export const useImageColorPairs = (imageUrl?: string) => {
  const [colorPairs, setColorPairs] = useState<ColorPair[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  useEffect(() => {
    const generatePairs = async () => {
      if (!imageUrl) {
        setColorPairs([]);
        return;
      }
      setIsLoading(true);
      setError(null);
      try {
        const result = await ImageColors.getColors(imageUrl, {
          cache: true,
          key: imageUrl,
        });
        const pairs = createColorPairsFromPalette(result);
        setColorPairs(pairs);
      } catch (e) {
        console.error('[useImageColorPairs] ', e);
        setError(e as Error);
      } finally {
        setIsLoading(false);
      }
    };

    generatePairs();
  }, [imageUrl]);

  return { colorPairs, isLoading, error };
};

function createColorPairsFromPalette(palette: ImageColorsResult): ColorPair[] {
  let potentialPairs: ColorPair[] = [];

  if (palette.platform === 'android') {
    potentialPairs = [
      { top: palette.vibrant, bottom: palette.darkVibrant },
      { top: palette.lightVibrant, bottom: palette.dominant },
      { top: palette.dominant, bottom: palette.darkMuted },
      { top: palette.muted, bottom: palette.darkMuted },
      { top: palette.lightMuted, bottom: palette.darkMuted },
    ].filter((p) => p.top && p.bottom);
  } else if (palette.platform === 'ios') {
    potentialPairs = [
      { top: palette.primary, bottom: palette.secondary },
      { top: palette.background, bottom: palette.detail },
      { top: palette.primary, bottom: palette.background },
      { top: palette.secondary, bottom: palette.detail },
    ].filter((p) => p.top && p.bottom);
  } else {
    return [];
  }
  const uniquePairs = Array.from(new Map(potentialPairs.map((p) => [p.top, p])).values());

  return uniquePairs;
}
