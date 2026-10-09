import { relations, sql } from 'drizzle-orm';
import { char, pgSchema, text } from 'drizzle-orm/pg-core';

export const i18nSchema = pgSchema('i18n');

export const countries = i18nSchema.table('countries', {
  iso31661: char('iso_3166_1', { length: 2 }).primaryKey(),
});

export const languages = i18nSchema.table('languages', {
  iso6391: char('iso_639_1', { length: 2 }).primaryKey(),
});

export const defaultCountries = i18nSchema.table('default_countries', {
  iso6391: char('iso_639_1', { length: 2 })
    .primaryKey()
    .references(() => languages.iso6391, { onDelete: 'cascade' }),
  // Null when the language has no region-specific default (e.g. plain "fr").
  iso31661: char('iso_3166_1', { length: 2 }).references(() => countries.iso31661, {
    onDelete: 'cascade',
  }),
});
export const defaultCountriesRelations = relations(defaultCountries, ({ one }) => ({
  language: one(languages, {
    fields: [defaultCountries.iso6391],
    references: [languages.iso6391],
  }),
  country: one(countries, {
    fields: [defaultCountries.iso31661],
    references: [countries.iso31661],
  }),
}));

export const supportedLanguages = i18nSchema.table('supported_languages', {
  iso6391: char('iso_639_1', { length: 2 })
    .notNull()
    .references(() => languages.iso6391, { onDelete: 'cascade' }),
  // Null when the supported locale has no region (e.g. plain "fr" instead of "fr-FR").
  iso31661: char('iso_3166_1', { length: 2 }).references(() => countries.iso31661, {
    onDelete: 'cascade',
  }),
  language: text('language')
    .generatedAlwaysAs(
      sql`CASE WHEN iso_3166_1 IS NULL THEN iso_639_1 ELSE iso_639_1 || '-' || iso_3166_1 END`,
    )
    .primaryKey(),
});
export const supportedLanguagesRelations = relations(supportedLanguages, ({ one }) => ({
  languageDef: one(languages, {
    fields: [supportedLanguages.iso6391],
    references: [languages.iso6391],
  }),
  countryDef: one(countries, {
    fields: [supportedLanguages.iso31661],
    references: [countries.iso31661],
  }),
}));

/* ---------------------------------- SEED ---------------------------------- */
