import { describe, expect, it } from "vitest";

import { boardAt, buildBoard, prepareBoard } from "./index";
import { DISPLACEMENT_WATCHLIST, jobPost, observations, release, TEST_ACCOUNT } from "./testing";

/**
 * The scrubber's performance rests on one claim: filtering pre-computed detections by
 * `noticed_at <= as_of` gives the same board as re-running the detectors against a history
 * truncated at `as_of`. If that ever stops being true, the UI and the API return different
 * numbers for the same question — the worst possible failure for a tool whose entire pitch
 * is that the arithmetic is checkable.
 *
 * So the equivalence is asserted rather than assumed, at every crawl date.
 */

const watchlist = DISPLACEMENT_WATCHLIST;

const HISTORY = observations(
  ["2026-01-05", { headcount: 100, funding_stage: "seed", funding_total_usd: 4_000_000, stack: ["Warehowse", "Rivalytics"] }],
  [
    "2026-02-10",
    { headcount: 100, funding_stage: "seed", funding_total_usd: 4_000_000, stack: ["Warehowse", "Rivalytics"] },
    [jobPost("2026-01-20", "Senior Backend Engineer"), jobPost("2026-02-01", "Analytics Engineer")],
  ],
  [
    "2026-03-15",
    { headcount: 140, funding_stage: "series_a", funding_total_usd: 26_000_000, stack: ["Warehowse"] },
    [
      jobPost("2026-02-20", "Staff Data Engineer"),
      jobPost("2026-03-01", "Security Engineer"),
      jobPost("2026-03-05", "Engineering Manager"),
      release("2026-03-10", "Platform 2.0"),
    ],
  ],
  [
    "2026-05-01",
    { headcount: 210, funding_stage: "series_a", funding_total_usd: 26_000_000, stack: ["Warehowse"], execs: [{ fn: "engineering", title: "VP Engineering" }] },
    [jobPost("2026-04-10", "Senior Backend Engineer")],
  ],
);

const DATES = ["2026-01-05", "2026-02-10", "2026-03-15", "2026-04-01", "2026-05-01", "2026-07-20"];

function truncatedBoard(as_of: string) {
  return buildBoard({
    accounts: [TEST_ACCOUNT],
    observations: HISTORY.filter((observation) => observation.observed_at <= as_of),
    watchlist,
    as_of,
  });
}

describe("prepare-then-filter equals detect-on-truncated-history", () => {
  const prepared = prepareBoard({ accounts: [TEST_ACCOUNT], observations: HISTORY, watchlist });

  it.each(DATES)("matches at %s", (as_of) => {
    const scrubbed = boardAt(prepared, as_of);
    const truncated = truncatedBoard(as_of);

    expect(scrubbed.rows[0]!.total).toBe(truncated.rows[0]!.total);
    expect(scrubbed.rows[0]!.signals.map((signal) => [signal.key, signal.decayed])).toEqual(
      truncated.rows[0]!.signals.map((signal) => [signal.key, signal.decayed]),
    );
    expect(scrubbed.rows[0]!.state).toBe(truncated.rows[0]!.state);
  });

  it("never reads an observation from the future", () => {
    // Asked about January, the engine must not know about the March round, even though the
    // prepared history contains it.
    const january = boardAt(prepared, "2026-01-20");
    expect(january.rows[0]!.signals).toEqual([]);
    expect(january.rows[0]!.state).toBe("quiet");
  });

  it("is stable when called twice", () => {
    expect(JSON.stringify(boardAt(prepared, "2026-05-01"))).toBe(
      JSON.stringify(boardAt(prepared, "2026-05-01")),
    );
  });
});

describe("the sparkline", () => {
  const prepared = prepareBoard({ accounts: [TEST_ACCOUNT], observations: HISTORY, watchlist });

  it("stops at the as-of date and agrees with the board at each point", () => {
    const board = boardAt(prepared, "2026-03-15");
    const sparkline = board.rows[0]!.sparkline;

    expect(sparkline.length).toBeGreaterThan(2);
    expect(sparkline.every((point) => point.at <= "2026-03-15")).toBe(true);

    for (const point of sparkline) {
      expect(point.total).toBe(boardAt(prepared, point.at).rows[0]!.total);
    }
  });
});
