export * from './utils/getDictionary';
export * from './utils/getFallbackLocale';
export * from './utils/getLocaleFromHeaders';
export * from './locales';

import en from './dictionaries/en-US.json';
export type Messages = typeof en;
