import { useState, useEffect, useCallback } from 'react';
import ImageColors from 'react-native-image-colors';

export const useImagePalette = (
  imageUrl?: string,
): { palette: string[] | null | undefined; isLoading: boolean; error: Error | null } => {
  const [palette, setPalette] = useState<string[] | null | undefined>(undefined);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const fetchPalette = useCallback(async () => {
    if (!imageUrl) {
      setPalette(null);
      return;
    }
    setIsLoading(true);
    setError(null);
    try {
      const result = await ImageColors.getColors(imageUrl, {
        cache: true,
        key: imageUrl,
      });

      let colors: string[] = [];
      if (result.platform === 'android') {
        colors = [result.average, result.vibrant, result.dominant, result.muted].filter(
          (c) => c !== undefined,
        );
      } else if (result.platform === 'ios') {
        colors = [result.primary, result.secondary, result.background, result.detail].filter(
          (c) => c !== undefined,
        );
      } else if (result.platform === 'web') {
        colors = [result.dominant, result.vibrant, result.muted].filter((c) => c !== undefined);
      }
      setPalette([...new Set(colors)]);
    } catch (e) {
      console.error('[useImagePalette]', e);
      setError(e as Error);
    } finally {
      setIsLoading(false);
    }
  }, [imageUrl]);

  useEffect(() => {
    // Fetch-on-mount/url-change; fetchPalette sets loading/error state before awaiting the result.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchPalette();
  }, [fetchPalette]);

  return { palette, isLoading, error };
};
