import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Localization from 'expo-localization';
import deepmerge from 'deepmerge';
import { loadPolyfills } from './polyfills';
import {
  defaultSupportedLocale,
  getDictionary,
  getFallbackLocale,
  SupportedLocale,
} from '@libs/i18n';

export const getLocale = async (): Promise<string> => {
  let saved = await AsyncStorage.getItem('language');

  if (!saved) {
    const deviceLocale = Localization.getLocales()[0]?.languageTag ?? defaultSupportedLocale;
    saved = deviceLocale;
    await AsyncStorage.setItem('language', saved);
  }

  return saved;
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
