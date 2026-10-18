import { SupportedLocale, supportedLocales } from '@libs/i18n';
import { capitalize } from 'lodash';

/**
 * Each supported locale's own name, in its own language (the standard
 * convention for a language picker - so you can find yours even if the app
 * is currently stuck in one you don't read, and never e.g. "Anglais" while
 * the UI is in French). Resolved via `Intl.DisplayNames` instead of a
 * hand-maintained label map: the full tag is the *display* locale (so the
 * right script/casing conventions apply), but the target passed to `.of()`
 * is just the primary language subtag - `.of()` with the full tag renders
 * the region-qualified form instead (`Intl.DisplayNames(['fr-FR']).of('fr-FR')`
 * -> "français (France)", not the plain endonym this needs).
 */
const useLocalizedLanguageName = () => {
  return supportedLocales.map((locale) => {
    const [iso_639_1, iso_3166_1] = locale.split('-');
    return {
      locale,
      iso_639_1,
      iso_3166_1,
      name: capitalize(new Intl.DisplayNames([locale], { type: 'language' }).of(iso_639_1)),
    };
  });
};

export default useLocalizedLanguageName;

export type LocalizedLanguageName = {
  locale: SupportedLocale;
  iso_639_1: string;
  iso_3166_1: string;
  name: string;
};
