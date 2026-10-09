import {
  defaultSupportedLocale,
  HEADER_LANGUAGE_KEY,
  SupportedLocale,
  supportedLocales,
} from '../locales';

export function getLocaleFromHeaders(headers: any): SupportedLocale {
  if (!headers) return defaultSupportedLocale;

  const getHeader = (key: string): string | undefined | null => {
    if (typeof headers.get === 'function') {
      return headers.get(key);
    }
    return headers[key] || headers[key.toLowerCase()];
  };

  let locale = getHeader(HEADER_LANGUAGE_KEY);

  if (!locale) {
    const acceptLang = getHeader('accept-language');
    if (acceptLang) {
      locale = acceptLang.split(',')[0];
    }
  }

  if (locale && supportedLocales.includes(locale as SupportedLocale)) {
    return locale as SupportedLocale;
  }

  return defaultSupportedLocale;
}
