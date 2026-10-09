import { SupportedLocale } from '../locales';

export const getDictionary = async (locale: SupportedLocale) => {
  switch (locale) {
    case 'fr':
      return (await import(`../dictionaries/fr.json`)).default;
    case 'en':
    default:
      return (await import(`../dictionaries/en.json`)).default;
  }
};
