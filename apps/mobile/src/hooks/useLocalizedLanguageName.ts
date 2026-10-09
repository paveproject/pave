import { SupportedLocale, supportedLocales } from '@libs/i18n';
import getUnicodeFlagIcon from 'country-flag-icons/unicode';
import { capitalize } from 'lodash';

const useLocalizedLanguageName = (locale: SupportedLocale) => {
  const iso6391 = new Intl.DisplayNames([locale], { type: 'language' });
  const iso31661 = new Intl.DisplayNames([locale], { type: 'region' });
  return supportedLocales.map((locale) => {
    const [iso_639_1, iso_3166_1] = locale.split('-');
    return {
      language: locale,
      iso_639_1: capitalize(iso6391.of(iso_639_1)),
      iso_3166_1: iso31661.of(iso_3166_1),
      flag: getUnicodeFlagIcon(iso_3166_1),
    };
  });
};

export default useLocalizedLanguageName;
