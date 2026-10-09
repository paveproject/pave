export const supportedLocales = ['fr', 'en'] as const;

export type SupportedLocale = (typeof supportedLocales)[number];

export const defaultSupportedLocale: SupportedLocale = 'en';

export const isSupportedLocale = (locale: string): locale is SupportedLocale => {
  return supportedLocales.includes(locale as SupportedLocale);
};
