import React, { useEffect, useState } from 'react';
import { ViewStyle } from 'react-native';
import Animated, { FadeIn, FadeOut, LinearTransition } from 'react-native-reanimated';

type CarouselProps<T> = {
  items: T[];
  delay?: number;
  renderItem: (item: T, index: number) => React.ReactNode;
  transitionIn?: typeof FadeIn;
  transitionOut?: typeof FadeOut;
  containerStyle?: ViewStyle;
  onChange?: (item: T, index: number) => void;
  random?: boolean;
};

export function LoopCarousel<T>({
  items,
  delay = 6000,
  renderItem,
  transitionIn = FadeIn,
  transitionOut = FadeOut,
  containerStyle,
  onChange,
  random = true,
}: CarouselProps<T>) {
  // Intentionally impure: shuffles once per distinct `items` array, memoized so the
  // order stays stable across re-renders instead of reshuffling every render.
  /* eslint-disable react-hooks/purity */
  const shuffledItems = React.useMemo(() => {
    if (random) {
      const array = [...items];
      for (let i = array.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [array[i], array[j]] = [array[j], array[i]];
      }
      return array;
    }
    return items;
  }, [items, random]);
  /* eslint-enable react-hooks/purity */

  const [index, setIndex] = useState(0);
  const item = shuffledItems[index];

  useEffect(() => {
    if (onChange && shuffledItems.length > 0) {
      onChange(shuffledItems[0], 0);
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (shuffledItems.length === 0) return;

    const id = setInterval(() => {
      setIndex((i) => {
        const nextIndex = (i + 1) % shuffledItems.length;
        return nextIndex;
      });
    }, delay);

    return () => clearInterval(id);
  }, [shuffledItems.length, delay]);

  useEffect(() => {
    if (onChange && shuffledItems[index]) {
      onChange(shuffledItems[index], index);
    }
  }, [index, shuffledItems, onChange]);

  if (!item) return null;

  return (
    <Animated.View
      key={index}
      style={containerStyle}
      entering={transitionIn.duration(1000)}
      exiting={transitionOut.duration(1000)}
      layout={LinearTransition.duration(1000)}
    >
      {renderItem(item, index)}
    </Animated.View>
  );
}
