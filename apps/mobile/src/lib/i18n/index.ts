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

  // `languageTag` is a full BCP-47 tag (e.g. "fr-CA", "en-GB") - the
  // device's actual region is essentially never a match for one of our
  // two supported (language, region) pairs, so this matches on just the
  // primary language subtag against each supported locale's own subtag
  // (not an exact-tag match) - any region variant of a supported
  // language resolves to pave's one supported variant of it.
  const deviceLanguage = Localization.getLocales()[0]?.languageTag?.split('-')[0];
  const guessed =
    supportedLocales.find((locale) => locale.split('-')[0] === deviceLanguage) ??
    defaultSupportedLocale;

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
