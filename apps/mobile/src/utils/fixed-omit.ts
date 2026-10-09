/**
 * Une version distributive du type `Omit` de TypeScript.
 * Corrige le problème où `Omit` ne fonctionne pas correctement avec les unions de types (comme les unions discriminées).
 * @see https://github.com/microsoft/TypeScript/issues/53696
 */
export type FixedOmit<T, K extends keyof any> = T extends any
  ? Pick<T, Exclude<keyof T, K>>
  : never;
