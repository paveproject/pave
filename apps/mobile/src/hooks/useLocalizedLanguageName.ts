import { SupportedLocale, supportedLocales } from '@libs/i18n';
import { capitalize } from 'lodash';

/**
 * Each supported locale's own name, in its own language (the standard
 * convention for a language picker - so you can find yours even if the app
 * is currently stuck in one you don't read). Resolved via `Intl.DisplayNames`
 * instead of a hand-maintained label map, by passing each locale as its own
 * display locale (the "of itself" trick that yields the endonym, e.g.
 * `Intl.DisplayNames(['fr']).of('fr')` -> "français", not a translation into
 * whatever locale happens to be currently selected).
 */
const useLocalizedLanguageName = () => {
  return supportedLocales.map((locale) => ({
    locale,
    name: capitalize(new Intl.DisplayNames([locale], { type: 'language' }).of(locale)),
  }));
};

export default useLocalizedLanguageName;

export type LocalizedLanguageName = {
  locale: SupportedLocale;
  name: string;
};
