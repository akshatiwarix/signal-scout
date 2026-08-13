/**
 * Date-only arithmetic over `YYYY-MM-DD` strings.
 *
 * Every date in this system is a calendar day with no time and no zone. Anything
 * that reaches for `new Date()` without an argument, or formats with the host's
 * locale, makes the engine's output depend on where it ran — which would break the
 * sweep's determinism assertion before it broke anything a user could see.
 */

const MS_PER_DAY = 86_400_000;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * `Date.parse` is not a validator: it accepts `2026-02-31` and quietly rolls it
 * over to March 3. The only reliable check is to parse and then confirm the day
 * came back as the day that went in.
 */
export function isIsoDate(value: string): boolean {
  if (!ISO_DATE.test(value)) return false;
  const ms = Date.parse(`${value}T00:00:00Z`);
  if (Number.isNaN(ms)) return false;
  return new Date(ms).toISOString().slice(0, 10) === value;
}

/** Days since the epoch. `YYYY-MM-DD` is parsed as UTC midnight, so there is no DST drift. */
export function toDayNumber(date: string): number {
  const ms = Date.parse(`${date}T00:00:00Z`);
  if (Number.isNaN(ms)) throw new Error(`not an ISO date: ${date}`);
  return Math.round(ms / MS_PER_DAY);
}

export function fromDayNumber(day: number): string {
  const iso = new Date(day * MS_PER_DAY).toISOString();
  return iso.slice(0, 10);
}

/** `b - a` in whole days. Positive when `b` is later. */
export function daysBetween(a: string, b: string): number {
  return toDayNumber(b) - toDayNumber(a);
}

export function addDays(date: string, days: number): string {
  return fromDayNumber(toDayNumber(date) + days);
}

export function isOnOrBefore(date: string, limit: string): boolean {
  return toDayNumber(date) <= toDayNumber(limit);
}

export function earliest(dates: string[]): string | null {
  let best: string | null = null;
  for (const date of dates) {
    if (best === null || toDayNumber(date) < toDayNumber(best)) best = date;
  }
  return best;
}

export function latest(dates: string[]): string | null {
  let best: string | null = null;
  for (const date of dates) {
    if (best === null || toDayNumber(date) > toDayNumber(best)) best = date;
  }
  return best;
}

/** Ascending calendar order, for sorting observations and evidence. */
export function compareDates(a: string, b: string): number {
  return toDayNumber(a) - toDayNumber(b);
}
