import { SupportedLocale } from '../locales';

export const getDictionary = async (locale: SupportedLocale) => {
  switch (locale) {
    case 'fr':
      return require('../dictionaries/fr.json');
    case 'en':
    default:
      return require('../dictionaries/en.json');
  }
};
