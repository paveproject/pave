import { useEffect, useState } from 'react';

interface Subscribable<T> {
  subscribe: (callback: (value: T) => void) => { unsubscribe: () => void };
}

/**
 * Subscribes to any RxJS-shaped observable (WatermelonDB's `.observe()`
 * included) for the lifetime of the component. Re-subscribes whenever
 * `getObservable` itself changes identity - wrap the call site in its
 * own `useCallback` (with whatever deps actually matter) the same way
 * you would for any other function passed into a `useEffect`.
 */
export const useObservable = <T>(getObservable: () => Subscribable<T>, initialValue: T): T => {
  const [value, setValue] = useState<T>(initialValue);

  useEffect(() => {
    const subscription = getObservable().subscribe(setValue);
    return () => subscription.unsubscribe();
  }, [getObservable]);

  return value;
};
