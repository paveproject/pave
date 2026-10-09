import { defaultSupportedLocale, SupportedLocale } from '../locales';

/**
 * Get the fallback language for a given locale
 *
 * @param locale - The locale to get the fallback language for
 * @returns The fallback language or null if the locale is the default
 * @category i18n
 * @module getFallbackLanguage
 *
 * @example
 * ```tsx
 * const fallbackLanguage = getFallbackLanguage({ locale: 'fr-CA' });
 * ```
 * @example
 * ```tsx
 * const fallbackLanguage = getFallbackLanguage({ locale: 'en' });
 * ```
 */
export const getFallbackLocale = ({
  locale,
}: {
  locale: SupportedLocale;
}): SupportedLocale | null => {
  if (locale === defaultSupportedLocale) return null;
  switch (locale) {
    default:
      return defaultSupportedLocale;
  }
};
