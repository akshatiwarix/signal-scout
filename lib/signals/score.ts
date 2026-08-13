import { decayDetail, decayOf, horizonDetail } from "./decay";
import { count, label } from "./format";
import { FAMILIES } from "./types";
import type {
  DecayedSignal,
  DroppedSignal,
  Family,
  FamilyBreakdown,
  Signal,
  Watchlist,
} from "./types";

/**
 * Combine decayed signals into one number per account.
 *
 * Three rules, each present because the obvious alternative is wrong:
 *
 * **Diminishing returns inside a family.** Positive contributions are sorted by size and
 * multiplied by 1, ½, ¼, ⅛ … A plain sum would let six blog posts outrank a funding round
 * plus a new CTO, and rank-by-volume is how a signal product becomes a publishing
 * leaderboard.
 *
 * **Negatives at full weight.** No diminishing, because a second piece of bad news is not
 * less bad. Two rounds of layoffs is worse than one, exactly twice as worth avoiding.
 *
 * **Family caps that sum to 100.** The total is therefore natively 0–100 with no
 * normalization step and no division anywhere in this file — which removes the whole
 * `NaN` / divide-by-zero class rather than guarding against it. When a user edits caps so
 * they no longer sum to 100, the board shows the real denominator (`72 / 140`) instead of
 * renormalizing, because renormalizing would put the division back.
 *
 * Rounding happens once, per signal. Family points are the sum of the integers shown in
 * the breakdown, so the column adds up on screen; totalling floats and rounding at the
 * end would produce a family total nobody can reproduce with a calculator.
 */

export const TOTAL_FLOOR = -25;

interface ScoredFamily {
  breakdown: FamilyBreakdown;
  signals: DecayedSignal[];
  dropped: DroppedSignal[];
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function scoreFamily(
  family: Family,
  signals: Signal[],
  watchlist: Watchlist,
  as_of: string,
): ScoredFamily {
  const cap = watchlist.families[family].cap;
  const live: DecayedSignal[] = [];
  const dropped: DroppedSignal[] = [];

  const aged = signals
    .map((signal) => ({ signal, decayed: decayOf(signal, watchlist, as_of) }))
    .filter((entry) => {
      if (!entry.decayed.past_horizon) return true;
      dropped.push({
        signal: entry.signal,
        reason: "past_horizon",
        detail: horizonDetail(entry.decayed),
      });
      return false;
    });

  const positives = aged
    .filter((entry) => entry.signal.raw >= 0)
    .sort((a, b) => b.signal.raw * b.decayed.decay_factor - a.signal.raw * a.decayed.decay_factor);
  const negatives = aged.filter((entry) => entry.signal.raw < 0);

  let points = 0;

  positives.forEach((entry, index) => {
    const rank_multiplier = 0.5 ** index;
    const value = entry.signal.raw * entry.decayed.decay_factor * rank_multiplier;
    const rounded = Math.round(value);

    // A signal whose contribution rounds to nothing, or that arrives after the family is
    // already at its cap, is reported as dropped rather than rendered as a 0-point row.
    if (rounded === 0) {
      dropped.push({
        signal: entry.signal,
        reason: "rounds_to_zero",
        detail: `${decayDetail(entry.signal, entry.decayed, rounded)} — worth less than a point`,
      });
      return;
    }

    if (points >= cap) {
      dropped.push({
        signal: entry.signal,
        reason: "clipped_by_cap",
        detail:
          `${label(family)} was already at its cap of ${count(cap)} pts, ` +
          `so this signal's ${count(rounded)} pts changed nothing`,
      });
      return;
    }

    points += rounded;
    live.push({
      ...entry.signal,
      age_days: entry.decayed.age_days,
      half_life_days: entry.decayed.half_life_days,
      decay_factor: entry.decayed.decay_factor,
      rank_multiplier,
      decayed: rounded,
      detail:
        `${entry.signal.detail}. ${decayDetail(entry.signal, entry.decayed, rounded)}` +
        (index > 0
          ? `, then × ${rank_multiplier} as the ${count(index + 1)}${index === 1 ? "nd" : index === 2 ? "rd" : "th"} ${label(family)} signal`
          : ""),
    });
  });

  for (const entry of negatives) {
    const value = entry.signal.raw * entry.decayed.decay_factor;
    const rounded = Math.round(value);
    if (rounded === 0) {
      dropped.push({
        signal: entry.signal,
        reason: "rounds_to_zero",
        detail: `${decayDetail(entry.signal, entry.decayed, rounded)} — worth less than a point`,
      });
      continue;
    }

    points += rounded;
    live.push({
      ...entry.signal,
      age_days: entry.decayed.age_days,
      half_life_days: entry.decayed.half_life_days,
      decay_factor: entry.decayed.decay_factor,
      rank_multiplier: 1,
      decayed: rounded,
      detail: `${entry.signal.detail}. ${decayDetail(entry.signal, entry.decayed, rounded)} against you, at full weight`,
    });
  }

  const clamped = clamp(points, -cap, cap);

  return {
    breakdown: { family, points: clamped, cap, clipped: points - clamped },
    signals: live,
    dropped,
  };
}

export interface ScoredAccount {
  total: number;
  denominator: number;
  families: FamilyBreakdown[];
  signals: DecayedSignal[];
  dropped: DroppedSignal[];
}

export function scoreSignals(
  signals: Signal[],
  watchlist: Watchlist,
  as_of: string,
): ScoredAccount {
  const byFamily = new Map<Family, Signal[]>();
  for (const signal of signals) {
    const bucket = byFamily.get(signal.family);
    if (bucket) bucket.push(signal);
    else byFamily.set(signal.family, [signal]);
  }

  const scored = FAMILIES.map((family) =>
    scoreFamily(family, byFamily.get(family) ?? [], watchlist, as_of),
  );

  const denominator = FAMILIES.reduce((sum, family) => sum + watchlist.families[family].cap, 0);
  const raw = scored.reduce((sum, entry) => sum + entry.breakdown.points, 0);

  return {
    // The floor is not zero on purpose: an account shedding a third of its staff has to be
    // able to rank *below* an account nothing has happened to, and a scale that stops at
    // zero cannot express that.
    total: clamp(raw, TOTAL_FLOOR, denominator),
    denominator,
    families: scored.map((entry) => entry.breakdown),
    signals: scored
      .flatMap((entry) => entry.signals)
      .sort((a, b) => Math.abs(b.decayed) - Math.abs(a.decayed)),
    dropped: scored.flatMap((entry) => entry.dropped),
  };
}
