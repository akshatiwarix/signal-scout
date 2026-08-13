import { addDays, compareDates, daysBetween, isOnOrBefore } from "./dates";
import { detectArrivals } from "./detect/arrivals";
import { assignIdentity } from "./detect/identity";
import { detectStateChanges } from "./detect/state";
import { lifecycleOf, rankRows } from "./rank";
import { scoreSignals } from "./score";
import type {
  Account,
  Board,
  BoardRow,
  BuildBoardInput,
  Detection,
  Iso,
  Observation,
  SparkPoint,
  Watchlist,
} from "./types";

/**
 * The engine's public surface.
 *
 * `buildBoard` is the canonical entry point and the only thing Day 007 `why-now` should
 * import. `prepareBoard` / `boardAt` exist for one specific reason: the UI's as-of scrubber
 * recomputes on every frame, and re-deriving detections 60 times a second would be wasteful
 * for no gain.
 *
 * That split is safe because of a property worth stating plainly: **a detection does not
 * depend on `as_of`.** Detectors only ever compare a crawl with the crawl before it, so the
 * detection produced at the crawl of 12 August is identical whether you ask on 12 August or
 * in October. Filtering by `noticed_at <= as_of` therefore gives exactly the same answer as
 * re-running the detectors against a truncated history — which is what
 * `equivalence.test.ts` asserts, so the optimisation cannot silently drift from the
 * definition.
 *
 * Identity, decay and scoring *do* depend on `as_of`, and are redone on every call.
 */

const SPARKLINE_STEP_DAYS = 7;

interface PreparedAccount {
  account: Account;
  detections: Detection[];
  /** Totals on a fixed weekly grid over the whole crawl range, so scrubbing never recomputes them. */
  trajectory: SparkPoint[];
}

export interface Prepared {
  watchlist: Watchlist;
  accounts: PreparedAccount[];
  crawl_dates: Iso[];
  first_crawl: Iso;
  last_crawl: Iso;
}

function group(observations: Observation[]): Map<string, Observation[]> {
  const byAccount = new Map<string, Observation[]>();
  for (const observation of observations) {
    const bucket = byAccount.get(observation.account_id);
    if (bucket) bucket.push(observation);
    else byAccount.set(observation.account_id, [observation]);
  }
  for (const bucket of byAccount.values()) {
    bucket.sort((a, b) => compareDates(a.observed_at, b.observed_at));
  }
  return byAccount;
}

function detectionsFor(observations: Observation[], watchlist: Watchlist): Detection[] {
  return [
    ...detectStateChanges(observations, watchlist),
    ...detectArrivals(observations, watchlist),
  ].sort((a, b) => compareDates(a.noticed_at, b.noticed_at));
}

function totalAt(detections: Detection[], watchlist: Watchlist, as_of: Iso): number {
  const visible = detections.filter((detection) => isOnOrBefore(detection.noticed_at, as_of));
  if (visible.length === 0) return 0;
  const { signals } = assignIdentity(visible, watchlist);
  return scoreSignals(signals, watchlist, as_of).total;
}

function weeklyGrid(from: Iso, to: Iso): Iso[] {
  const span = daysBetween(from, to);
  const grid: Iso[] = [];
  for (let day = 0; day <= span; day += SPARKLINE_STEP_DAYS) grid.push(addDays(from, day));
  if (grid[grid.length - 1] !== to) grid.push(to);
  return grid;
}

/**
 * One pass over the history. Re-run this when the **watchlist** changes — thresholds decide
 * what a detector even notices — but not when the as-of date moves.
 */
export function prepareBoard(input: Omit<BuildBoardInput, "as_of">): Prepared {
  const byAccount = group(input.observations);
  const crawl_dates = [...new Set(input.observations.map((o) => o.observed_at))].sort(compareDates);
  const first_crawl = crawl_dates[0] ?? "1970-01-01";
  const last_crawl = crawl_dates[crawl_dates.length - 1] ?? first_crawl;
  const grid = weeklyGrid(first_crawl, last_crawl);

  const accounts = input.accounts.map((account) => {
    const detections = detectionsFor(byAccount.get(account.id) ?? [], input.watchlist);
    return {
      account,
      detections,
      trajectory: grid.map((at) => ({
        at,
        total: totalAt(detections, input.watchlist, at),
      })),
    };
  });

  return { watchlist: input.watchlist, accounts, crawl_dates, first_crawl, last_crawl };
}

export function boardAt(prepared: Prepared, as_of: Iso): Board {
  const { watchlist } = prepared;
  const trendFrom = addDays(as_of, -watchlist.thresholds.trend_window_days);

  const rows: BoardRow[] = prepared.accounts.map(({ account, detections, trajectory }) => {
    const visible = detections.filter((detection) => isOnOrBefore(detection.noticed_at, as_of));
    const { signals, rejected } = assignIdentity(visible, watchlist);
    const scored = scoreSignals(signals, watchlist, as_of);

    const declined = rejected.map((entry) => ({
      signal: entry.signal,
      reason: "not_relevant" as const,
      detail: entry.reason,
    }));

    const trend = scored.total - totalAt(detections, watchlist, trendFrom);

    return {
      account,
      total: scored.total,
      denominator: scored.denominator,
      families: scored.families,
      signals: scored.signals,
      dropped: [...scored.dropped, ...declined],
      state: lifecycleOf({
        total: scored.total,
        live: scored.signals.length,
        ever: signals.length,
        trend,
      }),
      trend,
      sparkline: trajectory.filter((point) => isOnOrBefore(point.at, as_of)),
    };
  });

  const ranked = rankRows(rows);

  return {
    as_of,
    watchlist_name: watchlist.name,
    denominator: ranked[0]?.denominator ?? 0,
    act_now_at: watchlist.act_now_at,
    rows: ranked,
    summary: {
      accounts: ranked.length,
      live_signals: ranked.reduce((sum, row) => sum + row.signals.length, 0),
      above_act_now: ranked.filter((row) => row.total >= watchlist.act_now_at).length,
      contracting: ranked.filter((row) => row.state === "contracting").length,
    },
  };
}

/** The one call. Prepare, then read the board at a date. */
export function buildBoard(input: BuildBoardInput): Board {
  return boardAt(prepareBoard(input), input.as_of);
}

export { TOTAL_FLOOR } from "./score";
export type { Prepared as PreparedBoard };
