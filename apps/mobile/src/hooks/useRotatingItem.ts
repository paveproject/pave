import { useEffect, useMemo, useState } from 'react';

type UseRotatingItemOptions<T> = {
  items?: T[];
  interval?: number;
  random?: boolean;
};

export function useRotatingItem<T>({
  items = [],
  interval = 5000,
  random = true,
}: UseRotatingItemOptions<T>) {
  const randomItems = useMemo(() => {
    return random ? shuffle(items) : items;
  }, [items, random]);
  const [index, setIndex] = useState(0);
  const active = useMemo(() => {
    return randomItems[index];
  }, [index, randomItems]);

  useEffect(() => {
    if (items.length === 0) {
      return;
    }
    const id = setInterval(() => {
      setIndex((prevIndex) => (prevIndex + 1) % randomItems.length);
    }, interval);

    return () => {
      clearInterval(id);
    };
  }, [items, interval, randomItems.length]);

  return { active, index, total: items.length };
}

function shuffle<T>(array: T[]): T[] {
  const result = [...array];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}
