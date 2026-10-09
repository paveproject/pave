export type PrefixRegistry<Prefix extends string, T> = {
  [K in keyof T as `${Prefix}:${K & string}`]: T[K];
};

export function createPrefixedRegistry<Prefix extends string, T extends Record<string, any>>(
  prefix: Prefix,
  obj: T,
): PrefixRegistry<Prefix, T> {
  const result: Record<string, any> = {};

  for (const key in obj) {
    if (Object.prototype.hasOwnProperty.call(obj, key)) {
      result[`${prefix}:${key}`] = obj[key];
    }
  }

  return result as PrefixRegistry<Prefix, T>;
}
