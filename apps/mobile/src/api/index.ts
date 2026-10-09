export const persistKey = 'persist-data' as const;

export const withPersistKey = <const T extends readonly unknown[]>(
  key: T,
): readonly [typeof persistKey, ...T] => {
  return [persistKey, ...key];
};
