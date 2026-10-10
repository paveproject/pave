import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Localization from 'expo-localization';
import deepmerge from 'deepmerge';
import { loadPolyfills } from './polyfills';
import {
  defaultSupportedLocale,
  getDictionary,
  getFallbackLocale,
  SupportedLocale,
  supportedLocales,
} from '@libs/i18n';

export const getLocale = async (): Promise<string> => {
  const saved = await AsyncStorage.getItem('language');
  // Self-heals a previously-poisoned value too (see below) - an older
  // build could have written a raw, unvalidated tag here, which would
  // otherwise read back as "truthy" forever and never get the chance to
  // re-derive a real guess.
  if (saved && supportedLocales.includes(saved as SupportedLocale)) return saved;

  // `languageTag` is a full BCP-47 tag (e.g. "fr-FR", "en-US") - essentially
  // never a bare code match for `supportedLocales` - so it has to be
  // trimmed down to its primary language subtag and validated *before*
  // being persisted. Storing the raw tag here used to permanently poison
  // this key: `LocaleProvider`'s own `supportedLocales.includes(...)` guard
  // would reject it on every future launch (first one included), silently
  // forcing English forever regardless of what the user picked afterwards.
  const deviceLanguage = Localization.getLocales()[0]?.languageTag?.split('-')[0];
  const guessed = supportedLocales.includes(deviceLanguage as SupportedLocale)
    ? (deviceLanguage as SupportedLocale)
    : defaultSupportedLocale;

  await AsyncStorage.setItem('language', guessed);
  return guessed;
};

export const setLocale = async (locale: string): Promise<void> => {
  await AsyncStorage.setItem('language', locale);
};

const loadMessages = async (locale: SupportedLocale): Promise<Record<string, any>> => {
  const fallback = getFallbackLocale({ locale });

  const userMessages = await getDictionary(locale);

  if (!fallback || fallback === locale) {
    return userMessages;
  }

  const fallbackMessages = await loadMessages(fallback);
  return deepmerge(fallbackMessages, userMessages);
};

export const initI18n = async (locale: SupportedLocale) => {
  const messages = await loadMessages(locale);
  await loadPolyfills(locale);
  return {
    messages,
  };
};
