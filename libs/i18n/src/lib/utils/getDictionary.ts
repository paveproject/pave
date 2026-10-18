import { SupportedLocale } from '../locales';

export const getDictionary = async (locale: SupportedLocale) => {
  switch (locale) {
    case 'fr-FR':
      return (await import(`../dictionaries/fr-FR.json`)).default;
    case 'en-US':
    default:
      return (await import(`../dictionaries/en-US.json`)).default;
  }
};
