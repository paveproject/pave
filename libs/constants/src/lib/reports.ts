/**
 * The report taxonomy, and the single place it is declared.
 *
 * `libs/db`'s seed projects this into `report_family` / `report_type` (the
 * tables exist for the FK on `report.type` and for the API's validation, not
 * as the source of truth), and the mobile app reads it directly.
 *
 * Not fetched at runtime on purpose: a type is unusable by a client with no
 * icon and no label for it, and both ship with the bundle - so the taxonomy
 * can never usefully outrun the build. Changing it is a commit plus an OTA.
 */

export const REPORT_FAMILIES = [
  // Something is being used against people - "if you go there, you take it".
  'force_used',
  // Who is deployed. Nothing is necessarily happening.
  'presence',
  // Can I get through, can I leave.
  'movement',
  // Where to get help. The only family that isn't a hazard.
  'aid',
  // Am I being recorded, is the network up.
  'surveillance',
  // Escape valve for whatever the taxonomy doesn't cover in a given country.
  'other',
] as const;

export type ReportFamily = (typeof REPORT_FAMILIES)[number];

interface ReportTypeDef {
  family: ReportFamily;
  /**
   * The byte this type takes on the BLE mesh wire (see
   * `apps/mobile/src/lib/mesh/packet.ts`). Permanent once shipped and never
   * reused: a peer still running an older build decodes by this number, so
   * changing one silently reinterprets every relayed report of that type.
   * 0-8 are the nine types that shipped first. 255 is reserved for "unknown
   * to this build".
   */
  wire: number;
  /** Whether to offer it in the picker. */
  enabled: boolean;
  /**
   * ISO 3166-1 alpha-2 codes this type is offered in. `null` means
   * everywhere - `kettling` means nothing in some countries, and
   * `live_ammunition` is noise in others.
   */
  countries: readonly string[] | null;
}

export const REPORT_TYPES = {
  // ---------- shipped first: wire 0-8, never reorder ----------
  tear_gas: { family: 'force_used', wire: 0, enabled: true, countries: null },
  police_presence: { family: 'presence', wire: 1, enabled: true, countries: null },
  arrest: { family: 'presence', wire: 2, enabled: true, countries: null },
  violence: { family: 'force_used', wire: 3, enabled: true, countries: null },
  road_block: { family: 'movement', wire: 4, enabled: true, countries: null },
  medical: { family: 'aid', wire: 5, enabled: true, countries: null },
  water_cannon: { family: 'force_used', wire: 6, enabled: true, countries: null },
  kettling: { family: 'movement', wire: 7, enabled: true, countries: null },
  other: { family: 'other', wire: 8, enabled: true, countries: null },

  // ---------- force_used ----------
  stun_grenade: { family: 'force_used', wire: 9, enabled: true, countries: null },
  kinetic_rounds: { family: 'force_used', wire: 10, enabled: true, countries: null },
  live_ammunition: { family: 'force_used', wire: 11, enabled: true, countries: null },
  pepper_spray: { family: 'force_used', wire: 12, enabled: false, countries: null },
  baton_charge: { family: 'force_used', wire: 13, enabled: false, countries: null },
  mounted_police: { family: 'force_used', wire: 14, enabled: false, countries: null },
  vehicle_ramming: { family: 'force_used', wire: 15, enabled: false, countries: null },

  // ---------- presence ----------
  military_presence: { family: 'presence', wire: 16, enabled: true, countries: null },
  checkpoint: { family: 'presence', wire: 17, enabled: true, countries: null },
  abduction: { family: 'presence', wire: 18, enabled: true, countries: null },
  riot_police: { family: 'presence', wire: 19, enabled: false, countries: null },

  // ---------- movement ----------
  fire: { family: 'movement', wire: 20, enabled: true, countries: null },
  transit_closed: { family: 'movement', wire: 21, enabled: true, countries: null },
  exit_blocked: { family: 'movement', wire: 22, enabled: false, countries: null },

  // ---------- aid ----------
  safe_route: { family: 'aid', wire: 23, enabled: true, countries: null },
  legal_support: { family: 'aid', wire: 24, enabled: false, countries: null },
  water_supply: { family: 'aid', wire: 25, enabled: false, countries: null },

  // ---------- surveillance ----------
  internet_shutdown: { family: 'surveillance', wire: 26, enabled: true, countries: null },
  surveillance: { family: 'surveillance', wire: 27, enabled: false, countries: null },
  press_targeted: { family: 'surveillance', wire: 28, enabled: false, countries: null },
} as const satisfies Record<string, ReportTypeDef>;

/** Closed union - exhaustiveness is the point of declaring this in code. */
export type ReportTypeKey = keyof typeof REPORT_TYPES;

export const REPORT_TYPE_KEYS = Object.keys(REPORT_TYPES) as ReportTypeKey[];

/** Reserved wire value for a type this build doesn't know. */
export const UNKNOWN_WIRE_CODE = 255;

export const REPORT_TYPE_WIRE_CODES: Readonly<Record<ReportTypeKey, number>> = Object.fromEntries(
  REPORT_TYPE_KEYS.map((key) => [key, REPORT_TYPES[key].wire]),
) as Record<ReportTypeKey, number>;

export const REPORT_TYPE_BY_WIRE_CODE: ReadonlyMap<number, ReportTypeKey> = new Map(
  REPORT_TYPE_KEYS.map((key) => [REPORT_TYPES[key].wire, key]),
);

/**
 * The picker's contents, in declaration order (which is family order, then
 * position within the family). `country` omitted keeps country-restricted
 * types out rather than offering them blind.
 */
export const reportTypesFor = (country?: string): ReportTypeKey[] =>
  REPORT_TYPE_KEYS.filter((key) => {
    // Annotated, not inferred: every entry is `countries: null` today, so the
    // literal type narrows to `never` after the null check and a real country
    // list wouldn't typecheck.
    const def: ReportTypeDef = REPORT_TYPES[key];
    if (!def.enabled) return false;
    if (def.countries === null) return true;
    return country !== undefined && def.countries.includes(country);
  });

export const reportTypesInFamily = (family: ReportFamily): ReportTypeKey[] =>
  REPORT_TYPE_KEYS.filter((key) => REPORT_TYPES[key].family === family);
