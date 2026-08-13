import { daysBetween } from "./dates";
import { count, decimal } from "./format";
import type { Signal, Watchlist } from "./types";

/**
 * Age a signal.
 *
 * `decayed = raw × 0.5 ^ (age / half_life)`, where age is measured from the signal's
 * anchor — `changed_at` for a state delta, `last_evidence_at` for an arrival. Half-life
 * is a property of the *family*, not the signal type: five numbers a reviewer can hold
 * in their head instead of ten they have to look up.
 *
 * Exponential rather than step buckets, because buckets create cliffs. The as-of
 * scrubber is the main interaction in this product, and a reviewer dragging it will
 * land exactly on a cliff edge and watch the board reorder for a one-day change.
 *
 * Past `horizon_half_lives` (default 4, i.e. under 7% of raw) a signal is dropped
 * rather than rendered as a 1-point ghost that implies more precision than exists.
 */

export interface Decayed {
  age_days: number;
  half_life_days: number;
  decay_factor: number;
  horizon_days: number;
  past_horizon: boolean;
}

export function decayOf(signal: Signal, watchlist: Watchlist, as_of: string): Decayed {
  const half_life_days = watchlist.families[signal.family].half_life_days;
  // A negative age would mean the anchor is in the future — clamp rather than reward it
  // with a decay factor above 1.
  const age_days = Math.max(0, daysBetween(signal.anchor_at, as_of));
  const horizon_days = half_life_days * watchlist.thresholds.horizon_half_lives;

  return {
    age_days,
    half_life_days,
    decay_factor: 0.5 ** (age_days / half_life_days),
    horizon_days,
    past_horizon: age_days > horizon_days,
  };
}

/** The arithmetic, spelled out, so the number on the board can be checked by hand. */
export function decayDetail(signal: Signal, decayed: Decayed, points: number): string {
  const anchorLabel = signal.anchor === "changed_at" ? "since it changed" : "since the latest evidence";
  const window =
    signal.known_within_days > 45
      ? `, dated conservatively inside a ${count(signal.known_within_days)}-day window`
      : "";

  return (
    `${count(Math.abs(signal.raw))} raw × 0.5^(${count(decayed.age_days)}/${count(decayed.half_life_days)}) ` +
    `= ${decimal(Math.abs(signal.raw) * decayed.decay_factor)} → ${count(Math.abs(points))} pts ` +
    `(${count(decayed.age_days)}d ${anchorLabel}${window})`
  );
}

export function horizonDetail(decayed: Decayed): string {
  return (
    `${count(decayed.age_days)}d old, past the ${count(decayed.horizon_days)}d horizon ` +
    `(${count(decayed.half_life_days)}d half-life × ${decimal(decayed.horizon_days / decayed.half_life_days)})`
  );
}
