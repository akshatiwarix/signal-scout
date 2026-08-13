import { describe, expect, it } from "vitest";

import { ACCOUNTS, DEFAULT_AS_OF, OBSERVATIONS } from "@/data/dataset";
import { DEFAULT_WATCHLIST, PRESETS } from "@/data/presets";
import { boardAt, buildBoard, prepareBoard } from "@/lib/signals";
import type { Board, BoardRow } from "@/lib/signals/types";

/**
 * The engine against the real dataset. Where `dataset.test.ts` pins the *input*
 * distribution, this pins what the engine makes of it — the ten engineered rows are only
 * worth having if they visibly produce the behaviour they were designed to demonstrate.
 */

const prepared = prepareBoard({
  accounts: ACCOUNTS,
  observations: OBSERVATIONS,
  watchlist: DEFAULT_WATCHLIST,
});

const board = boardAt(prepared, DEFAULT_AS_OF);

function find(board: Board, id: string): BoardRow {
  const row = board.rows.find((candidate) => candidate.account.id === id);
  if (!row) throw new Error(`no row for ${id}`);
  return row;
}

function positionOf(board: Board, id: string): number {
  return board.rows.findIndex((row) => row.account.id === id);
}

describe("the board at the default as-of date", () => {
  it("puts some accounts over the act-now line without pretending most are urgent", () => {
    // A calibration check as much as a behaviour one: a threshold nothing ever crosses is
    // decoration, and one everything crosses is noise.
    expect(board.summary.above_act_now).toBeGreaterThan(0);
    expect(board.summary.above_act_now).toBeLessThan(10);
    expect(board.summary.contracting).toBeGreaterThan(0);
  });

  it("ranks all 40 accounts out of a denominator of 100", () => {
    expect(board.rows).toHaveLength(40);
    expect(board.denominator).toBe(100);
    expect(board.as_of).toBe(DEFAULT_AS_OF);
  });

  it("keeps every total inside the bounds the scoring rules promise", () => {
    for (const row of board.rows) {
      expect(row.total).toBeGreaterThanOrEqual(-25);
      expect(row.total).toBeLessThanOrEqual(100);
      expect(Number.isInteger(row.total)).toBe(true);
    }
  });

  it("gives every live signal a non-empty detail carrying its arithmetic", () => {
    const signals = board.rows.flatMap((row) => row.signals);
    expect(signals.length).toBeGreaterThan(10);
    for (const signal of signals) {
      expect(signal.detail.length).toBeGreaterThan(0);
      expect(signal.detail).toContain("raw × 0.5^(");
    }
  });
});

describe("the engineered rows do what they were built to do", () => {
  it("a001's six market events are clipped to the family cap", () => {
    const row = find(board, "a001");
    const market = row.families.find((family) => family.family === "market");

    // Five launches in five weeks: two contribute, the rest hit the cap. The saturation
    // rule is what stops a company that ships often from owning the board.
    expect(market?.points).toBe(market?.cap);
    expect(row.dropped.filter((entry) => entry.reason === "clipped_by_cap").length).toBeGreaterThan(0);
    expect(row.signals.length).toBeLessThan(row.signals.length + row.dropped.length);
  });

  it("a002's exec hire plus hiring outranks a001's noise", () => {
    expect(find(board, "a002").total).toBeGreaterThan(find(board, "a001").total);
    expect(positionOf(board, "a002")).toBeLessThan(positionOf(board, "a001"));
  });

  it("a003 is quiet rather than empty, and a004 sits below it", () => {
    const quiet = find(board, "a003");
    const contracting = find(board, "a004");

    expect(quiet.state).toBe("quiet");
    expect(quiet.total).toBe(0);
    expect(quiet.signals).toEqual([]);

    expect(contracting.state).toBe("contracting");
    expect(contracting.total).toBeLessThan(0);
    expect(positionOf(board, "a004")).toBeGreaterThan(positionOf(board, "a003"));
  });

  it("a005's round is dated conservatively across the 89-day gap", () => {
    const funding = find(board, "a005").signals.find(
      (signal) => signal.type === "funding_round",
    );

    expect(funding?.known_within_days).toBe(89);
    // Anchored at the start of the gap, not the crawl that revealed it: 89 days old on the
    // day it becomes visible, so it is already half-decayed rather than looking brand new.
    expect(funding?.anchor_at).toBe("2026-05-15");
    expect(funding?.age_days).toBe(89);
    expect(funding?.decayed).toBe(9);
    expect(funding?.detail).toContain("dated conservatively inside a 89-day window");
  });

  it("a006 emits nothing at the crawl that discovered it", () => {
    const discovery = boardAt(prepared, "2026-06-12");
    const row = find(discovery, "a006");

    expect(row.signals).toEqual([]);
    expect(row.state).toBe("quiet");
  });

  it("a007's surge re-fires when it triples", () => {
    const keys = find(board, "a007")
      .signals.concat(find(board, "a007").dropped.map((entry) => entry.signal as never))
      .filter((signal) => signal.type === "hiring_surge")
      .map((signal) => signal.key);

    expect(keys.some((key) => key.endsWith("#2"))).toBe(true);
  });

  it("a008's round has decayed to about a third of its raw weight", () => {
    const funding = find(board, "a008").signals.find(
      (signal) => signal.type === "funding_round",
    );

    // 25 raw, anchored 89 days back, 60-day half-life: 25 × 0.5^(89/60) = 8.9 → 9.
    expect(funding?.age_days).toBe(89);
    expect(funding?.raw).toBe(25);
    expect(funding?.decayed).toBe(9);
  });

  it("a009 is stale where a003 is quiet", () => {
    const row = find(board, "a009");

    expect(row.state).toBe("stale");
    expect(row.signals).toEqual([]);
    expect(row.dropped.some((entry) => entry.reason === "past_horizon")).toBe(true);
  });

  it("a010 and a011 score the same delta in opposite directions", () => {
    const dropped = find(board, "a010");
    const added = find(board, "a011");

    const droppedTech = dropped.families.find((family) => family.family === "technology");
    const addedTech = added.families.find((family) => family.family === "technology");

    expect(droppedTech!.points).toBeGreaterThan(0);
    expect(addedTech!.points).toBeLessThan(0);
    expect(positionOf(board, "a010")).toBeLessThan(positionOf(board, "a011"));
  });
});

describe("scrubbing the date", () => {
  it("shows a008's round losing value as the as-of date advances", () => {
    const points = ["2026-06-12", "2026-07-10", "2026-07-24", "2026-08-12"].map(
      (as_of) =>
        find(boardAt(prepared, as_of), "a008").signals.find(
          (signal) => signal.type === "funding_round",
        )?.decayed ?? 0,
    );

    expect(points).toEqual([...points].sort((a, b) => b - a));
    expect(points[0]).toBeGreaterThan(points[points.length - 1]!);
  });

  it("reorders the board rather than merely restyling it", () => {
    const spring = boardAt(prepared, "2026-05-15").rows.map((row) => row.account.id);
    const summer = board.rows.map((row) => row.account.id);
    expect(spring).not.toEqual(summer);
  });
});

describe("every preset", () => {
  it.each(PRESETS.map((preset) => [preset.name, preset] as const))(
    "%s produces a scored board with its own denominator",
    (_name, watchlist) => {
      const result = buildBoard({
        accounts: ACCOUNTS,
        observations: OBSERVATIONS,
        watchlist,
        as_of: DEFAULT_AS_OF,
      });

      const caps = Object.values(watchlist.families).reduce((sum, family) => sum + family.cap, 0);
      expect(result.denominator).toBe(caps);
      expect(result.rows.some((row) => row.total > 0)).toBe(true);
    },
  );

  it("between them, the presets fire all ten detectors", () => {
    const fired = new Set<string>();
    for (const watchlist of PRESETS) {
      const result = buildBoard({
        accounts: ACCOUNTS,
        observations: OBSERVATIONS,
        watchlist,
        as_of: DEFAULT_AS_OF,
      });
      for (const row of result.rows) {
        for (const signal of row.signals) fired.add(signal.type);
        for (const entry of row.dropped) fired.add(entry.signal.type);
      }
    }

    expect([...fired].sort()).toEqual([
      "exec_change",
      "funding_round",
      "headcount_contraction",
      "headcount_growth",
      "hiring_surge",
      "key_role_opened",
      "positioning_change",
      "product_launch",
      "stack_added",
      "stack_dropped",
    ]);
  });
});
