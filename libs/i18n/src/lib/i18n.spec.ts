import { describe, it, expect } from 'bun:test';
import { getFallbackLocale } from './i18n';

describe('i18n utils', () => {
  it('should return the correct fallback locale', () => {
    expect(getFallbackLocale({ locale: 'fr' })).toEqual('en');
  });
});
