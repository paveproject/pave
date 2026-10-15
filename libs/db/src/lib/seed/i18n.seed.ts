import { supportedLocales, defaultSupportedLocale } from '@libs/i18n';
import { countries, languages, supportedLanguages, defaultCountries } from '../schemas/i18n';
import { notInArray, sql } from 'drizzle-orm';
import { DbClient } from '../client';

export const seedI18n = async (db: DbClient) => {
  console.log('🌍 i18n synchronization in progress...');

  const uniqueLangs = new Set<string>();
  const uniqueCountries = new Set<string>();
  const supportedPairs: { iso6391: string; iso31661: string | null }[] = [];

  for (const locale of supportedLocales) {
    const [lang, country] = locale.split('-');
    if (!lang) continue;
    uniqueLangs.add(lang);
    if (country) uniqueCountries.add(country);
    // Country is optional: a locale like "fr" is stored as (fr, null).
    supportedPairs.push({ iso6391: lang, iso31661: country ?? null });
  }

  const uniqueLangsArr = Array.from(uniqueLangs);
  const uniqueCountriesArr = Array.from(uniqueCountries);
  const localesArr = [...supportedLocales];

  // 1. Languages
  if (uniqueLangsArr.length > 0) {
    const langsData = uniqueLangsArr.map((l) => ({ iso6391: l }));
    await db.insert(languages).values(langsData).onConflictDoNothing();
  }

  // 2. Countries
  if (uniqueCountriesArr.length > 0) {
    const countriesData = uniqueCountriesArr.map((c) => ({ iso31661: c }));
    await db.insert(countries).values(countriesData).onConflictDoNothing();
  }

  // 3. Supported Language-Country Pairs
  if (supportedPairs.length > 0) {
    await db.insert(supportedLanguages).values(supportedPairs).onConflictDoNothing();
  }

  // 4. Default Locale
  //
  // `defaultCountries` is keyed on `iso6391` alone (one row per language),
  // so if the default locale's *region* ever changes while its language
  // doesn't (e.g. "en" -> "en-US"), the row already exists under the same
  // key - `onConflictDoNothing` would then silently leave the stale region
  // in place instead of updating it, and the cleanup pass below (which
  // deletes anything not matching the current default) would delete it
  // outright, leaving no default row at all. Upsert instead.
  const [defLang, defCountry] = defaultSupportedLocale.split('-');
  if (defLang) {
    await db
      .insert(defaultCountries)
      .values({ iso6391: defLang, iso31661: defCountry ?? null })
      .onConflictDoUpdate({
        target: defaultCountries.iso6391,
        set: { iso31661: defCountry ?? null },
      });
  }

  // Cleanup
  if (localesArr.length > 0) {
    await db.delete(supportedLanguages).where(notInArray(supportedLanguages.language, localesArr));
  }

  if (defLang) {
    await db
      .delete(defaultCountries)
      .where(
        sql`${defaultCountries.iso6391} != ${defLang} OR ${defaultCountries.iso31661} IS DISTINCT FROM ${defCountry ?? null}`,
      );
  }

  if (uniqueLangsArr.length > 0) {
    await db.delete(languages).where(notInArray(languages.iso6391, uniqueLangsArr));
  }

  if (uniqueCountriesArr.length > 0) {
    await db.delete(countries).where(notInArray(countries.iso31661, uniqueCountriesArr));
  }

  console.log('✅ i18n synchronization completed (Added missing, removed obsolete).');
};
