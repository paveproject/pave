/**
 * Drizzle's `mode: 'string'` timestamp columns (used across the whole schema) serialize as
 * Postgres' own text format — "YYYY-MM-DD HH:mm:ss.sss+OO", a space instead of "T" and a
 * colon-less UTC offset. V8/JSC parse that leniently, but Hermes follows the ECMAScript `Date`
 * grammar strictly and rejects it, producing an Invalid Date. Normalizing to real ISO 8601 fixes
 * this on both engines.
 */
export const parseApiDate = (value: string): Date => {
  const isoLike = value.includes('T') ? value : value.replace(' ', 'T');
  const normalized = /[+-]\d{2}$/.test(isoLike) ? `${isoLike}:00` : isoLike;
  return new Date(normalized);
};
