import type {
  Account,
  DecayAnchor,
  Family,
  Iso,
  Observation,
  ObservedItem,
  ObservedState,
  Signal,
  SignalType,
  Watchlist,
} from "./types";

/**
 * Fixtures for the engine's own tests.
 *
 * This lives inside `lib/signals/` and therefore obeys the purity rule — it cannot
 * import the real presets from `@/data`, and should not: a test that breaks when
 * someone retunes a preset is testing the wrong thing. The watchlist below is a
 * stable copy chosen for round numbers, so expected values in tests can be checked
 * by hand.
 */

export const DISPLACEMENT_WATCHLIST: Watchlist = {
  name: "Test watchlist",
  families: {
    money: { cap: 25, half_life_days: 60 },
    people: { cap: 25, half_life_days: 45 },
    growth: { cap: 20, half_life_days: 30 },
    technology: { cap: 20, half_life_days: 30 },
    market: { cap: 10, half_life_days: 21 },
  },
  weights: {
    funding_round: 25,
    exec_change: 22,
    exec_change_loss: 14,
    key_role_opened: 16,
    hiring_surge: 12,
    headcount_growth: 10,
    headcount_contraction: 18,
    stack_dropped: 20,
    stack_added: 10,
    stack_added_competitor: 16,
    positioning_change: 8,
    product_launch: 8,
  },
  thresholds: {
    surge_min_posts: 4,
    surge_window_days: 45,
    growth_min_pct: 15,
    contraction_min_pct: 10,
    refractory_days: 45,
    escalation_factor: 2,
    horizon_half_lives: 4,
    trend_window_days: 14,
  },
  relevant_functions: ["engineering", "data", "security", "it"],
  competitor_tools: ["Rivalytics", "Sentrylight"],
  complement_tools: ["Warehowse", "Terraflow"],
  act_now_at: 40,
};

export const TEST_ACCOUNT: Account = {
  id: "t001",
  name: "Testfield Systems",
  domain: "testfield-systems.example",
  industry: "Testing",
  fit: { score: 70, band: "moderate" },
};

function baseState(): ObservedState {
  return {
    headcount: 100,
    funding_stage: "series_a",
    funding_total_usd: 15_000_000,
    stack: ["Warehowse"],
    execs: [],
    tagline: "A tagline",
    homepage_hash: "home-1",
    pricing_page_hash: "price-1",
  };
}

export function observation(
  observed_at: Iso,
  state: Partial<ObservedState> = {},
  items: ObservedItem[] = [],
): Observation {
  return {
    account_id: TEST_ACCOUNT.id,
    observed_at,
    state: { ...baseState(), ...state },
    items,
  };
}

/**
 * Builds a crawl history from `[date, state, items?]` tuples. State is **not**
 * cumulative here: each entry is spelled out, so a test's expectations never depend on
 * a patch three lines above it.
 */
export function observations(
  ...entries: [Iso, Partial<ObservedState>, ObservedItem[]?][]
): Observation[] {
  return entries.map(([date, state, items]) => observation(date, state, items ?? []));
}

/**
 * A signal built directly, for tests about decay and scoring rather than detection.
 * `raw` is signed here — this bypasses the watchlist lookup on purpose, so a scoring test
 * does not break when a weight is retuned.
 */
export function makeSignal(fields: {
  type: SignalType;
  family: Family;
  subject?: string;
  raw: number;
  anchor_at: Iso;
  anchor?: DecayAnchor;
  known_within_days?: number;
  magnitude?: number | null;
}): Signal {
  const direction = fields.raw < 0 ? "negative" : "positive";
  return {
    key: `${TEST_ACCOUNT.id}:${fields.type}:${fields.subject ?? fields.type}`,
    account_id: TEST_ACCOUNT.id,
    type: fields.type,
    family: fields.family,
    subject: fields.subject ?? fields.type,
    direction,
    weight_key: fields.type,
    raw: fields.raw,
    anchor: fields.anchor ?? "changed_at",
    anchor_at: fields.anchor_at,
    known_within_days: fields.known_within_days ?? 0,
    magnitude: fields.magnitude ?? null,
    evidence: [{ observed_at: fields.anchor_at, note: "test evidence" }],
    detail: "test signal",
  };
}

export function jobPost(observed_at: Iso, title: string, department: string | null = null): ObservedItem {
  return { kind: "job_post", observed_at, title, department, location: null };
}

export function release(observed_at: Iso, title: string): ObservedItem {
  return { kind: "release", observed_at, title };
}
