import { StyleProp, StyleSheet } from 'react-native';

export function extractStyleKeys<T extends object, K extends keyof T>(
  style: StyleProp<T> | undefined,
  keys: K[],
): { extracted: Partial<Pick<T, K>>; restStyle?: Omit<T, K> } {
  const extracted: Partial<Pick<T, K>> = {};
  if (!style) return { extracted };

  const flat = StyleSheet.flatten(style) as T;
  if (!flat) return { extracted };

  const restStyle = { ...flat };

  for (const key of keys) {
    if (key in restStyle) {
      extracted[key] = restStyle[key];
      delete restStyle[key];
    }
  }

  return { extracted, restStyle };
}
