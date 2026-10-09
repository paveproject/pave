-- Custom SQL migration file, put your code below! --
CREATE SCHEMA IF NOT EXISTS i18n;

DO $$ BEGIN
    CREATE TYPE i18n.language AS (
      iso_639_1 text,
      iso_3166_1 text
    );
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE i18n.request_language AS (
      requested_language i18n.language,
      fallback_language i18n.language,
      default_language i18n.language
    );
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

CREATE OR REPLACE FUNCTION i18n.language()
 RETURNS i18n.request_language
 LANGUAGE sql
 STABLE
AS $function$
  WITH header_language_data AS (
    SELECT
      NULLIF(
        split_part(
          NULLIF(
            current_setting('app.current_language', true),
            ''
          ),
          '-', 1
        ),
        ''
      ) AS iso_639_1,
      NULLIF(
        split_part(
          NULLIF(
            current_setting('app.current_language', true),
            ''
          ),
          '-', 2
        ),
        ''
      ) AS iso_3166_1
  ),
  default_language_data AS (
    -- No region: our default locale ("en") has no country variant.
    SELECT
      'en' AS iso_639_1,
      NULL::text AS iso_3166_1
  ),
  fallback_language_data AS (
    SELECT
      dc.iso_639_1,
      dc.iso_3166_1
    FROM
      i18n.default_countries dc,
      header_language_data hl
    WHERE
      dc.iso_639_1 = hl.iso_639_1
    LIMIT 1
  ),
  requested_language_data AS (
    SELECT
      sl.iso_639_1,
      sl.iso_3166_1
    FROM
      i18n.supported_languages sl,
      header_language_data hl
    WHERE
      sl.iso_639_1 = hl.iso_639_1
      -- Null-safe: a country-less requested locale (e.g. "fr") must match a
      -- country-less supported_languages row (iso_3166_1 IS NULL) too.
      AND sl.iso_3166_1 IS NOT DISTINCT FROM hl.iso_3166_1
    LIMIT 1
  ),
  requested_language as (
    SELECT
      ROW(
        COALESCE(rl.iso_639_1, fbl.iso_639_1, dld.iso_639_1),
        COALESCE(rl.iso_3166_1, fbl.iso_3166_1, dld.iso_3166_1)
      )::i18n.language as requested_language
    FROM
      default_language_data dld
    LEFT JOIN
      requested_language_data rl ON TRUE
    LEFT JOIN
      fallback_language_data fbl ON TRUE
  ),
  fallback_language as (
    SELECT
      CASE
        WHEN (
          (fbl.iso_639_1 IS NULL AND fbl.iso_3166_1 IS NULL) OR
          (
            (rl.requested_language).iso_639_1 IS NOT DISTINCT FROM fbl.iso_639_1
            AND (rl.requested_language).iso_3166_1 IS NOT DISTINCT FROM fbl.iso_3166_1
          )
        )
        THEN NULL
        ELSE ROW(fbl.iso_639_1, fbl.iso_3166_1)::i18n.language
      END AS fallback_language
    FROM
      requested_language rl
    LEFT JOIN
      fallback_language_data fbl ON TRUE
  ),
  default_language AS (
    SELECT
      CASE
        WHEN (
          (
            dld.iso_639_1 IS NOT DISTINCT FROM (rl.requested_language).iso_639_1
            AND dld.iso_3166_1 IS NOT DISTINCT FROM (rl.requested_language).iso_3166_1
          ) OR (
            dld.iso_639_1 IS NOT DISTINCT FROM (fbl.fallback_language).iso_639_1
            AND dld.iso_3166_1 IS NOT DISTINCT FROM (fbl.fallback_language).iso_3166_1
          )
        )
        THEN NULL
        ELSE ROW(dld.iso_639_1, dld.iso_3166_1)::i18n.language
      END AS default_language
    FROM
      default_language_data dld
    LEFT JOIN
      requested_language rl ON TRUE
    LEFT JOIN
      fallback_language fbl ON TRUE
  )
  SELECT 
    ROW(
      rl.requested_language, 
      fbl.fallback_language, 
      dl.default_language 
    )::i18n.request_language
  FROM
    requested_language rl
  LEFT JOIN
    fallback_language fbl ON TRUE
  LEFT JOIN
    default_language dl ON TRUE;
$function$;
