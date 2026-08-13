import type { Watchlist } from "@/lib/signals/types";

/**
 * Three watchlists, one per go-to-market motion. Between them they fire all ten
 * detectors — a detector that appears in no preset is a detector nobody ever sees
 * work, which is how a feature ends up shipped and broken at the same time.
 *
 * Family caps sum to 100 in every preset, which is what makes the total natively
 * 0–100 with no normalization step. Editing a cap in the UI is allowed and the
 * board then honestly reads `72 / 140`; the engine never renormalizes.
 */

const BASE_THRESHOLDS = {
  surge_min_posts: 4,
  surge_window_days: 45,
  growth_min_pct: 15,
  contraction_min_pct: 10,
  refractory_days: 45,
  escalation_factor: 2,
  horizon_half_lives: 4,
  trend_window_days: 14,
} as const;

/** Invented tool names throughout — see the note in the README about synthetic data. */
export const COMPETITORS = ["Rivalytics", "Sentrylight", "Datastream Pro"];
export const COMPLEMENTS = ["Warehowse", "Modelform", "Terraflow", "Podship", "Pagelight"];

export const DISPLACEMENT_MOTION: Watchlist = {
  name: "Displacement motion",
  families: {
    money: { cap: 15, half_life_days: 60 },
    people: { cap: 20, half_life_days: 45 },
    growth: { cap: 15, half_life_days: 30 },
    technology: { cap: 40, half_life_days: 30 },
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
    stack_dropped: 34,
    stack_added: 10,
    stack_added_competitor: 22,
    positioning_change: 7,
    product_launch: 8,
  },
  thresholds: { ...BASE_THRESHOLDS },
  relevant_functions: ["engineering", "data", "it", "security"],
  competitor_tools: [...COMPETITORS],
  complement_tools: [...COMPLEMENTS],
  act_now_at: 18,
};

export const GROWTH_MOTION: Watchlist = {
  name: "Growth motion",
  families: {
    money: { cap: 20, half_life_days: 60 },
    people: { cap: 30, half_life_days: 45 },
    growth: { cap: 30, half_life_days: 30 },
    technology: { cap: 12, half_life_days: 30 },
    market: { cap: 8, half_life_days: 21 },
  },
  weights: {
    funding_round: 25,
    exec_change: 26,
    exec_change_loss: 16,
    key_role_opened: 20,
    hiring_surge: 16,
    headcount_growth: 14,
    headcount_contraction: 22,
    stack_dropped: 18,
    stack_added: 8,
    stack_added_competitor: 14,
    positioning_change: 6,
    product_launch: 7,
  },
  thresholds: { ...BASE_THRESHOLDS, surge_min_posts: 3 },
  relevant_functions: ["engineering", "data", "revops", "people"],
  competitor_tools: [...COMPETITORS],
  complement_tools: [...COMPLEMENTS],
  act_now_at: 20,
};

export const BUDGET_MOTION: Watchlist = {
  name: "Budget motion",
  families: {
    money: { cap: 40, half_life_days: 75 },
    people: { cap: 22, half_life_days: 45 },
    growth: { cap: 16, half_life_days: 30 },
    technology: { cap: 12, half_life_days: 30 },
    market: { cap: 10, half_life_days: 21 },
  },
  weights: {
    funding_round: 40,
    exec_change: 20,
    exec_change_loss: 12,
    key_role_opened: 12,
    hiring_surge: 10,
    headcount_growth: 12,
    headcount_contraction: 16,
    stack_dropped: 16,
    stack_added: 8,
    stack_added_competitor: 14,
    positioning_change: 9,
    product_launch: 8,
  },
  thresholds: { ...BASE_THRESHOLDS, growth_min_pct: 20 },
  relevant_functions: ["finance", "revops", "operations", "engineering"],
  competitor_tools: [...COMPETITORS],
  complement_tools: [...COMPLEMENTS],
  act_now_at: 16,
};

export const PRESETS: Watchlist[] = [DISPLACEMENT_MOTION, GROWTH_MOTION, BUDGET_MOTION];

export const DEFAULT_WATCHLIST = DISPLACEMENT_MOTION;
