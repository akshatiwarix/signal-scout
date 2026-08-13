/**
 * Number formatting for `detail` strings.
 *
 * Locale is pinned to `en-US` on purpose: detail strings are asserted in tests and
 * compared across runs by the sweep's determinism check, so a machine's locale must
 * not be able to change the engine's output.
 */

const INTEGER = new Intl.NumberFormat("en-US");
const ONE_DECIMAL = new Intl.NumberFormat("en-US", {
  minimumFractionDigits: 1,
  maximumFractionDigits: 1,
});

export function count(value: number): string {
  return INTEGER.format(Math.round(value));
}

export function decimal(value: number): string {
  return ONE_DECIMAL.format(value);
}

export function percent(value: number): string {
  return `${ONE_DECIMAL.format(value)}%`;
}

/** `$26M`, `$4.5M`, `$900K` — readable at a glance, exact enough for a funding delta. */
export function money(usd: number): string {
  if (usd >= 1_000_000_000) return `$${ONE_DECIMAL.format(usd / 1_000_000_000)}B`;
  if (usd >= 1_000_000) {
    const millions = usd / 1_000_000;
    return `$${Number.isInteger(millions) ? INTEGER.format(millions) : ONE_DECIMAL.format(millions)}M`;
  }
  if (usd >= 1_000) return `$${INTEGER.format(Math.round(usd / 1_000))}K`;
  return `$${INTEGER.format(usd)}`;
}

/** `series_a` → `Series A`, `it` → `IT`. Used in details and in the UI. */
export function label(value: string): string {
  const upper = new Set(["it", "cto", "ciso", "cfo", "coo", "cro", "cmo", "vp"]);
  return value
    .split("_")
    .map((part) => (upper.has(part) ? part.toUpperCase() : part.charAt(0).toUpperCase() + part.slice(1)))
    .join(" ");
}

export function plural(n: number, singular: string, pluralForm = `${singular}s`): string {
  return `${count(n)} ${n === 1 ? singular : pluralForm}`;
}
