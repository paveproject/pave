export const supportedLocales = ['fr-FR', 'en-US'] as const;

export type SupportedLocale = (typeof supportedLocales)[number];

export const defaultSupportedLocale: SupportedLocale = 'en-US';

export const isSupportedLocale = (locale: string): locale is SupportedLocale => {
  return supportedLocales.includes(locale as SupportedLocale);
};
