import { daysBetween } from "../dates";
import { count, label, money, percent } from "../format";
import {
  SIGNAL_FAMILY,
  stageRank,
  type Detection,
  type Fn,
  type Observation,
  type ObservedState,
  type Watchlist,
} from "../types";

/**
 * Detectors over scalar state: compare two adjacent observations of the same account
 * and report what moved.
 *
 * Two rules hold for everything in this file.
 *
 * **The first observation of an account emits nothing.** There is no pair to compare,
 * and diffing against an empty state would read every populated field as a change —
 * lighting up the entire board the day a crawler starts. The loop below simply has no
 * iteration for index 0, which is the cheapest possible way to be correct here, and
 * `first-observation.test.ts` guards it.
 *
 * **A state change is dated conservatively.** All the engine knows is that the change
 * happened somewhere in `(previous crawl, this crawl]`, so it anchors decay at the
 * *previous* crawl — the earliest moment it could have occurred — and records the width
 * of that window in `known_within_days`. Anchoring at the later date would make every
 * change look fresher than the evidence supports, and freshness is the entire product.
 */

function seatCounts(state: ObservedState): Map<Fn, number> {
  const counts = new Map<Fn, number>();
  for (const seat of state.execs) counts.set(seat.fn, (counts.get(seat.fn) ?? 0) + 1);
  return counts;
}

interface PairContext {
  account_id: string;
  previous: Observation;
  current: Observation;
  /** Width of the window the change is known to have happened inside. */
  known_within_days: number;
}

function base(
  context: PairContext,
  fields: Omit<Detection, "account_id" | "noticed_at" | "anchor" | "anchor_at" | "known_within_days" | "evidence"> &
    Partial<Pick<Detection, "evidence">>,
): Detection {
  return {
    account_id: context.account_id,
    noticed_at: context.current.observed_at,
    anchor: "changed_at",
    anchor_at: context.previous.observed_at,
    known_within_days: context.known_within_days,
    evidence: fields.evidence ?? [
      {
        observed_at: context.current.observed_at,
        note: `seen at the crawl of ${context.current.observed_at}`,
      },
    ],
    ...fields,
  };
}

function windowNote(context: PairContext): string {
  return context.known_within_days > 45
    ? ` (the crawler skipped ${count(context.known_within_days)} days, so the date is known only within that window)`
    : "";
}

function detectFunding(context: PairContext): Detection[] {
  const before = context.previous.state;
  const after = context.current.state;

  const stageAdvanced =
    before.funding_stage !== null &&
    after.funding_stage !== null &&
    stageRank(after.funding_stage) > stageRank(before.funding_stage);

  const raisedMore =
    before.funding_total_usd !== null &&
    after.funding_total_usd !== null &&
    after.funding_total_usd > before.funding_total_usd;

  if (!stageAdvanced && !raisedMore) return [];

  // Stage and total almost always move together; that is one round, not two signals.
  const subject = stageAdvanced && after.funding_stage ? after.funding_stage : "funding_total";
  const delta =
    raisedMore && before.funding_total_usd !== null && after.funding_total_usd !== null
      ? after.funding_total_usd - before.funding_total_usd
      : null;

  const parts: string[] = [];
  if (stageAdvanced && before.funding_stage && after.funding_stage) {
    parts.push(`${label(before.funding_stage)} → ${label(after.funding_stage)}`);
  }
  if (delta !== null) parts.push(`total raised up ${money(delta)}`);

  return [
    base(context, {
      type: "funding_round",
      family: SIGNAL_FAMILY.funding_round,
      subject,
      direction: "positive",
      weight_key: "funding_round",
      magnitude: delta,
      detail: `${parts.join(", ")}${windowNote(context)}`,
      rejected: null,
    }),
  ];
}

function detectExecs(context: PairContext, watchlist: Watchlist): Detection[] {
  const before = seatCounts(context.previous.state);
  const after = seatCounts(context.current.state);
  const relevant = new Set(watchlist.relevant_functions);
  const detections: Detection[] = [];

  for (const fn of new Set([...before.keys(), ...after.keys()])) {
    const delta = (after.get(fn) ?? 0) - (before.get(fn) ?? 0);
    if (delta === 0) continue;

    const gained = delta > 0;
    const title = gained
      ? context.current.state.execs.find((seat) => seat.fn === fn)?.title
      : context.previous.state.execs.find((seat) => seat.fn === fn)?.title;

    const detail = gained
      ? `${label(fn)} leadership seat appeared: ${title ?? label(fn)}${windowNote(context)}`
      : `${label(fn)} leadership seat disappeared: ${title ?? label(fn)} is no longer listed${windowNote(context)}`;

    detections.push(
      base(context, {
        type: "exec_change",
        family: SIGNAL_FAMILY.exec_change,
        subject: fn,
        direction: gained ? "positive" : "negative",
        weight_key: gained ? "exec_change" : "exec_change_loss",
        magnitude: Math.abs(delta),
        detail,
        rejected: relevant.has(fn)
          ? null
          : `${label(fn)} is not one of the functions on this watchlist`,
      }),
    );
  }

  return detections;
}

function detectHeadcount(context: PairContext, watchlist: Watchlist): Detection[] {
  const before = context.previous.state.headcount;
  const after = context.current.state.headcount;

  // A null headcount is not evidence of stability. No comparison, no signal.
  if (before === null || after === null || before === 0 || before === after) return [];

  const pct = ((after - before) / before) * 100;
  const grew = pct > 0;
  const threshold = grew
    ? watchlist.thresholds.growth_min_pct
    : watchlist.thresholds.contraction_min_pct;

  if (Math.abs(pct) < threshold) return [];

  const type = grew ? "headcount_growth" : "headcount_contraction";
  const direction = grew ? "positive" : "negative";
  const detail =
    `headcount ${count(before)} → ${count(after)}, ` +
    `${grew ? "up" : "down"} ${percent(Math.abs(pct))} against a ${percent(threshold)} threshold` +
    windowNote(context);

  return [
    base(context, {
      type,
      family: SIGNAL_FAMILY[type],
      subject: "headcount",
      direction,
      weight_key: type,
      magnitude: Math.round(Math.abs(pct) * 10) / 10,
      detail,
      rejected: null,
    }),
  ];
}

function detectStack(context: PairContext, watchlist: Watchlist): Detection[] {
  const before = new Set(context.previous.state.stack);
  const after = new Set(context.current.state.stack);
  const competitors = new Set(watchlist.competitor_tools);
  const complements = new Set(watchlist.complement_tools);
  const detections: Detection[] = [];

  for (const tool of after) {
    if (before.has(tool)) continue;
    const isCompetitor = competitors.has(tool);
    const isComplement = complements.has(tool);

    detections.push(
      base(context, {
        type: "stack_added",
        family: SIGNAL_FAMILY.stack_added,
        subject: tool,
        direction: isCompetitor ? "negative" : "positive",
        weight_key: isCompetitor ? "stack_added_competitor" : "stack_added",
        magnitude: null,
        detail: isCompetitor
          ? `${tool} appeared in the stack — a competitor just landed${windowNote(context)}`
          : `${tool} appeared in the stack${windowNote(context)}`,
        rejected:
          isCompetitor || isComplement
            ? null
            : `${tool} is on neither the competitor nor the complement list, so its arrival carries no weight`,
      }),
    );
  }

  for (const tool of before) {
    if (after.has(tool)) continue;
    const isCompetitor = competitors.has(tool);

    detections.push(
      base(context, {
        type: "stack_dropped",
        family: SIGNAL_FAMILY.stack_dropped,
        subject: tool,
        direction: "positive",
        weight_key: "stack_dropped",
        magnitude: null,
        detail: isCompetitor
          ? `${tool} disappeared from the stack — the displacement window is open${windowNote(context)}`
          : `${tool} disappeared from the stack${windowNote(context)}`,
        // A complement leaving is churn in someone else's product, not an opening in yours.
        rejected: isCompetitor
          ? null
          : `${tool} is not a competitor, so its removal is not a displacement opportunity`,
      }),
    );
  }

  return detections;
}

function detectPositioning(context: PairContext): Detection[] {
  const before = context.previous.state;
  const after = context.current.state;

  const changed: string[] = [];
  if (before.tagline !== after.tagline) changed.push("tagline");
  if (before.homepage_hash !== after.homepage_hash) changed.push("homepage");
  if (before.pricing_page_hash !== after.pricing_page_hash) changed.push("pricing page");
  if (changed.length === 0) return [];

  const taglineNote =
    before.tagline !== after.tagline && after.tagline
      ? `: "${before.tagline ?? "—"}" → "${after.tagline}"`
      : "";

  return [
    base(context, {
      // One subject, so a company rewriting its homepage three times in a quarter is
      // one story with three pieces of evidence rather than three signals.
      type: "positioning_change",
      family: SIGNAL_FAMILY.positioning_change,
      subject: "positioning",
      direction: "positive",
      weight_key: "positioning_change",
      magnitude: changed.length,
      detail: `${changed.join(" and ")} changed${taglineNote}${windowNote(context)}`,
      rejected: null,
      evidence: [
        {
          observed_at: context.current.observed_at,
          note: `${changed.join(", ")} differed from the crawl of ${context.previous.observed_at}`,
        },
      ],
    }),
  ];
}

/**
 * Runs every state detector over one account's observations, in crawl order.
 * `observations` must already be filtered to `observed_at <= as_of` and sorted.
 */
export function detectStateChanges(
  observations: Observation[],
  watchlist: Watchlist,
): Detection[] {
  const detections: Detection[] = [];

  for (let i = 1; i < observations.length; i += 1) {
    const previous = observations[i - 1];
    const current = observations[i];
    if (!previous || !current) continue;

    const context: PairContext = {
      account_id: current.account_id,
      previous,
      current,
      known_within_days: daysBetween(previous.observed_at, current.observed_at),
    };

    detections.push(
      ...detectFunding(context),
      ...detectExecs(context, watchlist),
      ...detectHeadcount(context, watchlist),
      ...detectStack(context, watchlist),
      ...detectPositioning(context),
    );
  }

  return detections;
}
