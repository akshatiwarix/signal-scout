import { describe, expect, it } from "vitest";

import { scoreSignals, TOTAL_FLOOR } from "./score";
import { DISPLACEMENT_WATCHLIST, makeSignal } from "./testing";

const watchlist = DISPLACEMENT_WATCHLIST;
const AS_OF = "2026-08-12";

describe("decay arithmetic", () => {
  it("halves a money signal once per 60 days, and shows the working", () => {
    // 25 raw, 89 days old, 60-day half-life: 25 × 0.5^(89/60) = 8.96 → 9 points.
    const scored = scoreSignals(
      [makeSignal({ type: "funding_round", family: "money", raw: 25, anchor_at: "2026-05-15" })],
      watchlist,
      AS_OF,
    );

    expect(scored.signals[0]!.age_days).toBe(89);
    expect(scored.signals[0]!.decayed).toBe(9);
    expect(scored.signals[0]!.detail).toContain(
      "25 raw × 0.5^(89/60) = 8.9 → 9 pts (89d since it changed)",
    );
    expect(scored.total).toBe(9);
  });

  it("gives a signal its full weight on the day it happens", () => {
    const scored = scoreSignals(
      [makeSignal({ type: "funding_round", family: "money", raw: 25, anchor_at: AS_OF })],
      watchlist,
      AS_OF,
    );
    expect(scored.signals[0]!.decayed).toBe(25);
  });

  it("drops a signal past four half-lives instead of rendering a ghost", () => {
    // Market half-life is 21 days, so the horizon is 84.
    const scored = scoreSignals(
      [makeSignal({ type: "product_launch", family: "market", raw: 8, anchor_at: "2026-02-20" })],
      watchlist,
      AS_OF,
    );

    expect(scored.signals).toEqual([]);
    expect(scored.total).toBe(0);
    expect(scored.dropped[0]!.reason).toBe("past_horizon");
    expect(scored.dropped[0]!.detail).toBe("173d old, past the 84d horizon (21d half-life × 4.0)");
  });
});

describe("diminishing returns", () => {
  it("halves each successive positive in a family", () => {
    const scored = scoreSignals(
      [
        makeSignal({ type: "product_launch", family: "market", subject: "one", raw: 8, anchor_at: AS_OF }),
        makeSignal({ type: "product_launch", family: "market", subject: "two", raw: 8, anchor_at: AS_OF }),
        makeSignal({ type: "product_launch", family: "market", subject: "three", raw: 8, anchor_at: AS_OF }),
      ],
      watchlist,
      AS_OF,
    );

    // 8 then 4 takes the family to 12, over its cap of 10, so the third signal is never
    // added at all — it lands in `dropped` as clipped. Points clamp from 12 to 10.
    const market = scored.families.find((family) => family.family === "market");
    expect(market).toEqual({ family: "market", points: 10, cap: 10, clipped: 2 });
    expect(scored.signals.map((signal) => signal.decayed)).toEqual([8, 4]);
    expect(scored.dropped.map((entry) => entry.reason)).toEqual(["clipped_by_cap"]);
    expect(scored.total).toBe(10);
  });

  it("keeps noise from outranking substance", () => {
    const noise = scoreSignals(
      Array.from({ length: 6 }, (_, i) =>
        makeSignal({ type: "product_launch", family: "market", subject: `r${i}`, raw: 8, anchor_at: AS_OF }),
      ),
      watchlist,
      AS_OF,
    );

    const substance = scoreSignals(
      [
        makeSignal({ type: "funding_round", family: "money", raw: 25, anchor_at: AS_OF }),
        makeSignal({ type: "exec_change", family: "people", raw: 22, anchor_at: AS_OF }),
      ],
      watchlist,
      AS_OF,
    );

    expect(noise.total).toBe(10);
    expect(substance.total).toBe(47);
    expect(substance.total).toBeGreaterThan(noise.total);
  });

  it("reports a signal the cap swallowed rather than hiding it", () => {
    const scored = scoreSignals(
      Array.from({ length: 4 }, (_, i) =>
        makeSignal({ type: "product_launch", family: "market", subject: `r${i}`, raw: 8, anchor_at: AS_OF }),
      ),
      watchlist,
      AS_OF,
    );

    const clipped = scored.dropped.filter((entry) => entry.reason === "clipped_by_cap");
    expect(clipped.length).toBeGreaterThan(0);
    expect(clipped[0]!.detail).toContain("already at its cap of 10 pts");
  });
});

describe("negatives", () => {
  it("applies no diminishing returns to bad news", () => {
    const scored = scoreSignals(
      [
        makeSignal({ type: "headcount_contraction", family: "growth", subject: "a", raw: -18, anchor_at: AS_OF }),
        makeSignal({ type: "stack_added", family: "technology", subject: "b", raw: -16, anchor_at: AS_OF }),
      ],
      watchlist,
      AS_OF,
    );

    expect(scored.signals.every((signal) => signal.rank_multiplier === 1)).toBe(true);
    expect(scored.total).toBe(-25); // -34 floored
  });

  it("lets a contracting account rank below an account with no signals at all", () => {
    const contracting = scoreSignals(
      [makeSignal({ type: "headcount_contraction", family: "growth", raw: -18, anchor_at: AS_OF })],
      watchlist,
      AS_OF,
    );
    const silent = scoreSignals([], watchlist, AS_OF);

    expect(contracting.total).toBe(-18);
    expect(silent.total).toBe(0);
    expect(contracting.total).toBeLessThan(silent.total);
  });

  it("clamps a family at its own cap before the total floor is reached", () => {
    // Five contractions sum to -90, but growth cannot go past -20. The family cap binds
    // first and the floor never comes into it: one family cannot sink an account alone.
    const scored = scoreSignals(
      Array.from({ length: 5 }, (_, i) =>
        makeSignal({
          type: "headcount_contraction",
          family: "growth",
          subject: `c${i}`,
          raw: -18,
          anchor_at: AS_OF,
        }),
      ),
      watchlist,
      AS_OF,
    );

    const growth = scored.families.find((family) => family.family === "growth");
    expect(growth?.points).toBe(-20);
    expect(growth?.clipped).toBe(-70);
    expect(scored.total).toBe(-20);
  });

  it("floors the total once several families turn negative", () => {
    const scored = scoreSignals(
      [
        makeSignal({ type: "headcount_contraction", family: "growth", raw: -18, anchor_at: AS_OF }),
        makeSignal({ type: "stack_added", family: "technology", raw: -16, anchor_at: AS_OF }),
        makeSignal({ type: "exec_change", family: "people", raw: -14, anchor_at: AS_OF }),
      ],
      watchlist,
      AS_OF,
    );
    expect(scored.total).toBe(TOTAL_FLOOR);
  });
});

describe("the denominator", () => {
  it("is the sum of the caps, and no division ever happens", () => {
    const scored = scoreSignals([], watchlist, AS_OF);
    expect(scored.denominator).toBe(100);
    expect(Number.isInteger(scored.total)).toBe(true);
  });

  it("reports the real denominator when caps no longer sum to 100", () => {
    const retuned = {
      ...watchlist,
      families: { ...watchlist.families, money: { cap: 65, half_life_days: 60 } },
    };
    const scored = scoreSignals(
      [makeSignal({ type: "funding_round", family: "money", raw: 25, anchor_at: AS_OF })],
      retuned,
      AS_OF,
    );

    expect(scored.denominator).toBe(140);
    expect(scored.total).toBe(25); // not rescaled to 100
  });
});

describe("every number stays a number", () => {
  it("survives a zero-weight signal, a zero cap, and an empty board", () => {
    const zeroed = {
      ...watchlist,
      families: { ...watchlist.families, growth: { cap: 0, half_life_days: 30 } },
    };
    const scored = scoreSignals(
      [makeSignal({ type: "hiring_surge", family: "growth", raw: 0, anchor_at: AS_OF })],
      zeroed,
      AS_OF,
    );

    expect(Number.isNaN(scored.total)).toBe(false);
    expect(scored.total).toBe(0);
    expect(scoreSignals([], watchlist, AS_OF).total).toBe(0);
  });
});
