import { z } from "zod";

import { isIsoDate } from "../signals/dates";
import {
  FAMILIES,
  FUNCTIONS,
  FUNDING_STAGES,
  SIGNAL_TYPES,
  type Account,
  type BuildBoardInput,
  type Observation,
  type Watchlist,
} from "../signals/types";

/**
 * The trust boundary. Types are hand-written in `lib/signals/types.ts` and these
 * schemas mirror them — duplication that is deliberate, because it is what keeps
 * Zod out of the engine and therefore out of the client bundle.
 *
 * The duplication is guarded rather than trusted: the assertions at the bottom of
 * this file fail `npm run typecheck` the moment one side drifts from the other.
 */

const isoDate = z.string().refine(isIsoDate, {
  message: "expected a date-only ISO string, YYYY-MM-DD",
});

const fnSchema = z.enum(FUNCTIONS);
const fundingStageSchema = z.enum(FUNDING_STAGES);

export const accountSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  domain: z.string().min(1),
  industry: z.string().min(1),
  fit: z.object({
    score: z.number().int().min(0).max(100),
    band: z.enum(["strong", "moderate", "weak"]),
  }),
});

export const observedStateSchema = z.object({
  headcount: z.number().int().min(0).nullable(),
  funding_stage: fundingStageSchema.nullable(),
  funding_total_usd: z.number().min(0).nullable(),
  stack: z.array(z.string().min(1)),
  execs: z.array(z.object({ fn: fnSchema, title: z.string().min(1) })),
  tagline: z.string().nullable(),
  homepage_hash: z.string().nullable(),
  pricing_page_hash: z.string().nullable(),
});

export const observedItemSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("job_post"),
    observed_at: isoDate,
    title: z.string().min(1),
    department: z.string().nullable(),
    location: z.string().nullable(),
  }),
  z.object({
    kind: z.literal("release"),
    observed_at: isoDate,
    title: z.string().min(1),
  }),
]);

export const observationSchema = z.object({
  account_id: z.string().min(1),
  observed_at: isoDate,
  state: observedStateSchema,
  items: z.array(observedItemSchema),
});

const weight = z.number().min(0).max(200);

const familyConfigSchema = z.object({
  cap: z.number().int().min(0).max(100),
  half_life_days: z.number().int().min(1).max(730),
});

/**
 * Families and weights are spelled out key by key rather than expressed as a
 * `z.record`, so that adding a signal type to the engine fails typecheck here
 * instead of silently accepting a watchlist with a missing weight.
 */
export const watchlistSchema = z.object({
  name: z.string().min(1),
  families: z.object({
    money: familyConfigSchema,
    people: familyConfigSchema,
    growth: familyConfigSchema,
    technology: familyConfigSchema,
    market: familyConfigSchema,
  }),
  // Magnitudes, so `min(0)` is a real constraint: a negative weight here would
  // invert a detector's meaning behind the user's back.
  weights: z.object({
    funding_round: weight,
    exec_change: weight,
    exec_change_loss: weight,
    key_role_opened: weight,
    hiring_surge: weight,
    headcount_growth: weight,
    headcount_contraction: weight,
    stack_dropped: weight,
    stack_added: weight,
    stack_added_competitor: weight,
    positioning_change: weight,
    product_launch: weight,
  }),
  thresholds: z.object({
    surge_min_posts: z.number().int().min(1).max(100),
    surge_window_days: z.number().int().min(1).max(365),
    growth_min_pct: z.number().min(0).max(1000),
    contraction_min_pct: z.number().min(0).max(100),
    refractory_days: z.number().int().min(0).max(730),
    escalation_factor: z.number().min(1).max(100),
    horizon_half_lives: z.number().min(1).max(20),
    trend_window_days: z.number().int().min(1).max(365),
  }),
  relevant_functions: z.array(fnSchema),
  competitor_tools: z.array(z.string().min(1)),
  complement_tools: z.array(z.string().min(1)),
  act_now_at: z.number().int().min(0).max(1000),
});

/** Body schema for `POST /api/board`. Caps are the route's, not the engine's. */
export const buildBoardInputSchema = z.object({
  accounts: z.array(accountSchema).min(1).max(500),
  observations: z.array(observationSchema).min(1).max(5_000),
  watchlist: watchlistSchema,
  as_of: isoDate,
});

export type ParsedWatchlist = z.infer<typeof watchlistSchema>;

// ---------------------------------------------------------------------------
// Compile-time guards. These are the reason the duplication above is safe.
// `Mirrors<A, B>` resolves to `true` only when A and B are mutually assignable,
// so a drift in either direction fails `tsc` rather than a request.
// ---------------------------------------------------------------------------

type Mirrors<A, B> = [A] extends [B] ? ([B] extends [A] ? true : never) : never;

const _account: Mirrors<z.infer<typeof accountSchema>, Account> = true;
const _observation: Mirrors<z.infer<typeof observationSchema>, Observation> = true;
const _watchlist: Mirrors<z.infer<typeof watchlistSchema>, Watchlist> = true;
const _input: Mirrors<z.infer<typeof buildBoardInputSchema>, BuildBoardInput> = true;

void _account;
void _observation;
void _watchlist;
void _input;

/** Re-exported so callers get one import site for the enums the UI iterates. */
export { FAMILIES, FUNCTIONS, SIGNAL_TYPES };
