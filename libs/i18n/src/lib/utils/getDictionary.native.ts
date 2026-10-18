import { SupportedLocale } from '../locales';

export const getDictionary = async (locale: SupportedLocale) => {
  switch (locale) {
    case 'fr-FR':
      return require('../dictionaries/fr-FR.json');
    case 'en-US':
    default:
      return require('../dictionaries/en-US.json');
  }
};
