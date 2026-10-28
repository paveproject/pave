import { sql } from 'drizzle-orm';
import { REPORT_FAMILIES, REPORT_TYPES, REPORT_TYPE_KEYS } from '@libs/constants';
import { DbClient } from '../client';
import { reportFamily, reportType } from '../schemas/report';

/**
 * Projects the taxonomy declared in @libs/constants into the DB. The tables
 * are there for the FK on `report.type` and for the API's validation - edit
 * the constant, not these rows.
 *
 * `onConflictDoUpdate` on purpose: re-running after a type is enabled or
 * moved to another family has to converge, where `DoNothing` would leave the
 * old row behind.
 */
export const seedReportTaxonomy = async (db: DbClient) => {
  console.log('Seeding report taxonomy...');

  await db
    .insert(reportFamily)
    .values(REPORT_FAMILIES.map((key) => ({ key })))
    .onConflictDoNothing({ target: reportFamily.key });

  await db
    .insert(reportType)
    .values(
      REPORT_TYPE_KEYS.map((key) => ({
        key,
        familyKey: REPORT_TYPES[key].family,
        wireCode: REPORT_TYPES[key].wire,
        enabled: REPORT_TYPES[key].enabled,
      })),
    )
    .onConflictDoUpdate({
      target: reportType.key,
      set: {
        familyKey: sql`excluded.family_key`,
        wireCode: sql`excluded.wire_code`,
        enabled: sql`excluded.enabled`,
      },
    });

  const enabled = REPORT_TYPE_KEYS.filter((key) => REPORT_TYPES[key].enabled).length;
  console.log(
    `Report taxonomy seeded: ${REPORT_FAMILIES.length} families, ` +
      `${REPORT_TYPE_KEYS.length} types (${enabled} enabled).`,
  );
};
