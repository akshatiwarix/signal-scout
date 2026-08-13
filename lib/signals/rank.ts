import type { BoardRow, LifecycleState } from "./types";

/**
 * Lifecycle state and ordering.
 *
 * The state is derived from the score trajectory every time the board is built — there is
 * no stored state machine and nothing persisted, which is what keeps the engine a pure
 * function of `(observations, watchlist, as_of)`.
 */

export interface LifecycleInput {
  total: number;
  /** Signals contributing right now. */
  live: number;
  /** Signals that ever fired at or before `as_of`, including ones now past the horizon. */
  ever: number;
  trend: number;
}

/**
 * First match wins.
 *
 * `stale` and `quiet` are deliberately separate states. "This went cold four months ago"
 * and "we have watched since February and nothing has ever happened" are opposite sales
 * situations — one is a lapsed opportunity, the other is a nurture — and every tool I have
 * seen renders both as an empty row.
 *
 * `stale` is keyed on there being no *live* signals rather than on `total === 0`, because a
 * positive and a negative signal can cancel to zero while both are perfectly current.
 */
export function lifecycleOf({ total, live, ever, trend }: LifecycleInput): LifecycleState {
  if (total < 0) return "contracting";
  if (ever === 0) return "quiet";
  if (live === 0) return "stale";
  if (trend > 0) return "rising";
  if (trend < 0) return "cooling";
  return "steady";
}

/**
 * Score descending, then fit descending, then name.
 *
 * Fit breaks ties rather than joining the score: two accounts at 38 points are equally
 * timely, and when timing cannot separate them the better-fitting one is the better use of
 * the next hour. Multiplying the two would instead make 38 mean nothing in particular.
 * Name is the final tiebreak so the order is stable across runs.
 */
export function rankRows(rows: BoardRow[]): BoardRow[] {
  return [...rows].sort((a, b) => {
    if (b.total !== a.total) return b.total - a.total;
    if (b.account.fit.score !== a.account.fit.score) {
      return b.account.fit.score - a.account.fit.score;
    }
    return a.account.name.localeCompare(b.account.name, "en");
  });
}
