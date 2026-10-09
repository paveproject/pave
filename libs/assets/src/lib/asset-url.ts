import { assetPaths } from '../__generated__/manifest';

type DeepValues<T> = T extends string
  ? T
  : T extends Record<string, unknown>
    ? { [K in keyof T]: DeepValues<T[K]> }[keyof T]
    : never;

// Union of every relative asset path declared under libs/assets/static/**,
// e.g. 'app/icon.png' | 'app/icon-light.png' | ... — kept in sync automatically
// since it's derived from the generated `assetPaths` tree, not hand-written.
export type AssetPath = DeepValues<typeof assetPaths>;

export function assetUrl(assetPath: AssetPath, baseUrl: string): string {
  return `${baseUrl.replace(/\/$/, '')}/${assetPath}`;
}
