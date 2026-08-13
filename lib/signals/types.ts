/**
 * The type contract for the whole engine.
 *
 * Two rules govern this file:
 *
 * 1. It imports nothing. Not `zod`, not `next`, not a sibling. `purity.test.ts`
 *    enforces the no-bare-specifier rule across `lib/signals/**`, and keeping the
 *    contract dependency-free is what lets the engine ship to the browser.
 * 2. Nothing here describes an *event*. `Observation` is what a crawler could have
 *    seen on a date; `Signal` is what the engine derived by comparing two of them.
 *    If a field name in the observation half starts sounding like a signal name,
 *    the central claim of the project has sprung a leak.
 */

/** Date-only ISO string, `YYYY-MM-DD`. There are no times anywhere in this system. */
export type Iso = string;

// ---------------------------------------------------------------------------
// Observed input — no labels, no events, nothing derived
// ---------------------------------------------------------------------------

export const FUNDING_STAGES = [
  "bootstrapped",
  "pre_seed",
  "seed",
  "series_a",
  "series_b",
  "series_c",
  "series_d",
  "public",
] as const;

export type FundingStage = (typeof FUNDING_STAGES)[number];

/** Ordinal position of a stage, used to tell an advance from a relabel. */
export function stageRank(stage: FundingStage): number {
  return FUNDING_STAGES.indexOf(stage);
}

/**
 * Business functions, coarse on purpose. A job title maps to one of these through
 * a keyword table in `functions.ts`; real normalization is Day 011.
 */
export const FUNCTIONS = [
  "engineering",
  "data",
  "security",
  "it",
  "product",
  "design",
  "marketing",
  "sales",
  "revops",
  "customer_success",
  "finance",
  "people",
  "operations",
  "legal",
] as const;

export type Fn = (typeof FUNCTIONS)[number];

export interface Account {
  id: string;
  name: string;
  /** Always a `.example` domain — no row can be mistaken for a real company. */
  domain: string;
  industry: string;
  /**
   * Arrives as data, as if produced by Day 001's `/api/score`. Never recomputed
   * here and never blended into the signal total — see the two-axes decision.
   */
  fit: { score: number; band: FitBand };
}

export type FitBand = "strong" | "moderate" | "weak";

export interface ExecSeat {
  fn: Fn;
  title: string;
}

/** Scalar state at a point in time. Diffing adjacent snapshots yields state signals. */
export interface ObservedState {
  headcount: number | null;
  funding_stage: FundingStage | null;
  funding_total_usd: number | null;
  /** Tool names as plain strings. Whether one is a competitor is a watchlist question. */
  stack: string[];
  execs: ExecSeat[];
  tagline: string | null;
  homepage_hash: string | null;
  pricing_page_hash: string | null;
}

export interface JobPostItem {
  kind: "job_post";
  observed_at: Iso;
  title: string;
  /** What the job board itself reported, when it reported anything. */
  department: string | null;
  location: string | null;
}

export interface ReleaseItem {
  kind: "release";
  observed_at: Iso;
  title: string;
}

/** Dated things seen since the previous observation. Arrival signals come from these. */
export type ObservedItem = JobPostItem | ReleaseItem;

export interface Observation {
  account_id: string;
  observed_at: Iso;
  state: ObservedState;
  items: ObservedItem[];
}

// ---------------------------------------------------------------------------
// Derived output
// ---------------------------------------------------------------------------

export const FAMILIES = ["money", "people", "growth", "technology", "market"] as const;

export type Family = (typeof FAMILIES)[number];

export const SIGNAL_TYPES = [
  "funding_round",
  "exec_change",
  "key_role_opened",
  "hiring_surge",
  "headcount_growth",
  "headcount_contraction",
  "stack_dropped",
  "stack_added",
  "positioning_change",
  "product_launch",
] as const;

export type SignalType = (typeof SIGNAL_TYPES)[number];

/**
 * Two detectors fire in both directions with different force, so the watchlist
 * carries a second weight for the minority case rather than pretending a sign flip
 * is enough. Losing an exec is a weaker trigger than gaining one; a competitor
 * entering the stack hurts more than a complement entering helps.
 *
 * All weights are stored as positive magnitudes. `Signal.direction` applies the
 * sign, so a user cannot invert the meaning of `headcount_contraction` by typing a
 * positive number into it.
 */
export const WEIGHT_KEYS = [
  ...SIGNAL_TYPES,
  "exec_change_loss",
  "stack_added_competitor",
] as const;

export type WeightKey = (typeof WEIGHT_KEYS)[number];

export const SIGNAL_FAMILY: Record<SignalType, Family> = {
  funding_round: "money",
  exec_change: "people",
  key_role_opened: "growth",
  hiring_surge: "growth",
  headcount_growth: "growth",
  headcount_contraction: "growth",
  stack_dropped: "technology",
  stack_added: "technology",
  positioning_change: "market",
  product_launch: "market",
};

/**
 * Which timestamp a signal ages from — the asymmetry that makes the decay model
 * believable.
 *
 * - `changed_at`: a state delta happened once and only gets older.
 * - `last_evidence_at`: an arrival pattern still producing evidence is still fresh.
 */
export type DecayAnchor = "changed_at" | "last_evidence_at";

export type Direction = "positive" | "negative";

export interface Evidence {
  observed_at: Iso;
  note: string;
}

export interface Signal {
  /** `account:type:subject`, plus `#n` once an escalation re-fires the same subject. */
  key: string;
  account_id: string;
  type: SignalType;
  family: Family;
  /** What the signal is *about*: a tool name, a function, a funding stage, `headcount`. */
  subject: string;
  direction: Direction;
  /** Which watchlist weight produced `raw` — shown in the breakdown, so the number is traceable. */
  weight_key: WeightKey;
  /** Signed weight before decay: the watchlist magnitude, negated when `direction` is negative. */
  raw: number;
  anchor: DecayAnchor;
  anchor_at: Iso;
  /**
   * How wide the window is that the change is known to have happened inside.
   * `0` when the two snapshots are adjacent; the gap length when they are not.
   */
  known_within_days: number;
  /** Post count, percentage change, USD delta — whatever the detector measured. */
  magnitude: number | null;
  evidence: Evidence[];
  /** The concrete comparison, always populated. This is what makes the board explainable. */
  detail: string;
}

/**
 * What a detector emits, before identity is assigned. One detection is "I compared
 * two things and noticed X"; a `Signal` is the folded, keyed, de-duplicated result.
 *
 * `rejected` carries a detector that looked and deliberately declined — a complement
 * leaving the stack, a job post in a function nobody sells to. Those reach the board
 * as `dropped` entries rather than vanishing, because "considered and dismissed" is
 * information and an empty explanation is not.
 */
export interface Detection {
  account_id: string;
  type: SignalType;
  family: Family;
  subject: string;
  direction: Direction;
  weight_key: WeightKey;
  /** The crawl date at which this became visible. Drives ordering, not decay. */
  noticed_at: Iso;
  anchor: DecayAnchor;
  /** The date decay measures from — for state deltas, the earliest it could have happened. */
  anchor_at: Iso;
  known_within_days: number;
  magnitude: number | null;
  evidence: Evidence[];
  detail: string;
  rejected: string | null;
}

export interface DecayedSignal extends Signal {
  age_days: number;
  half_life_days: number;
  /** `0.5 ^ (age / half_life)`, before the family's diminishing-returns multiplier. */
  decay_factor: number;
  /** Position multiplier inside the family: 1, 0.5, 0.25 … Always 1 for negatives. */
  rank_multiplier: number;
  /** Final integer points this signal contributed. */
  decayed: number;
}

/**
 * Why a signal is on the board but not in the score. `rounds_to_zero` is kept separate
 * from `past_horizon` because they are different facts: one is "too old to count", the
 * other is "still inside the horizon, but worth less than a point". Collapsing them would
 * tell a user their signal expired when it has not.
 */
export type DropReason =
  | "past_horizon"
  | "rounds_to_zero"
  | "clipped_by_cap"
  | "not_relevant";

export interface DroppedSignal {
  signal: Signal;
  reason: DropReason;
  detail: string;
}

export interface FamilyBreakdown {
  family: Family;
  points: number;
  cap: number;
  /** Points the cap removed. Non-zero here is the saturation rule visibly working. */
  clipped: number;
}

export type LifecycleState =
  | "contracting"
  | "quiet"
  | "stale"
  | "rising"
  | "cooling"
  | "steady";

export interface SparkPoint {
  at: Iso;
  total: number;
}

export interface BoardRow {
  account: Account;
  /** Integer in `[-25, denominator]`. Never the result of a division. */
  total: number;
  /** Sum of family caps — displayed as `72 / 100`, never divided by. */
  denominator: number;
  families: FamilyBreakdown[];
  signals: DecayedSignal[];
  dropped: DroppedSignal[];
  state: LifecycleState;
  /** `total` minus `total` at `asOf - trendWindowDays`. */
  trend: number;
  sparkline: SparkPoint[];
}

export interface Board {
  as_of: Iso;
  watchlist_name: string;
  denominator: number;
  act_now_at: number;
  rows: BoardRow[];
  /** Counts for the header strip; all derived from `rows`. */
  summary: {
    accounts: number;
    live_signals: number;
    above_act_now: number;
    contracting: number;
  };
}

// ---------------------------------------------------------------------------
// Watchlist — the ruler. The only thing an LLM is ever allowed to write.
// ---------------------------------------------------------------------------

export interface FamilyConfig {
  cap: number;
  half_life_days: number;
}

export interface Thresholds {
  surge_min_posts: number;
  surge_window_days: number;
  growth_min_pct: number;
  contraction_min_pct: number;
  refractory_days: number;
  escalation_factor: number;
  horizon_half_lives: number;
  trend_window_days: number;
}

export interface Watchlist {
  name: string;
  families: Record<Family, FamilyConfig>;
  /** Positive magnitudes only. Direction supplies the sign — see `WEIGHT_KEYS`. */
  weights: Record<WeightKey, number>;
  thresholds: Thresholds;
  relevant_functions: Fn[];
  competitor_tools: string[];
  complement_tools: string[];
  /** The line drawn across the board: at or above this, act today. */
  act_now_at: number;
}

export interface BuildBoardInput {
  accounts: Account[];
  observations: Observation[];
  watchlist: Watchlist;
  as_of: Iso;
}
