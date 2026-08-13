import { describe, expect, it } from "vitest";

import { DISPLACEMENT_MOTION } from "@/data/presets";
import { FAMILIES } from "@/lib/signals/types";

import { toWatchlist, type WatchlistDraft } from "./parse";

/**
 * Tests the assembly of a model draft into a watchlist. The network call itself is not
 * mocked and not tested — what matters is that nothing malformed can reach the engine, and
 * that every rejection is reported rather than silently repaired.
 */

const base = DISPLACEMENT_MOTION;

function draft(overrides: Partial<WatchlistDraft> = {}): WatchlistDraft {
  return {
    name: "Observability displacement",
    emphasis: [
      { family: "technology", emphasis: "high" },
      { family: "people", emphasis: "high" },
      { family: "market", emphasis: "low" },
    ],
    relevant_functions: ["engineering", "data"],
    competitor_tools: ["Rivalytics"],
    complement_tools: ["Warehowse"],
    act_now_at: 20,
    ...overrides,
  };
}

describe("assembling a watchlist", () => {
  it("turns emphasis buckets into integer caps that still sum to 100", () => {
    const { watchlist } = toWatchlist(draft(), base);
    const total = FAMILIES.reduce((sum, family) => sum + watchlist.families[family].cap, 0);

    expect(total).toBe(100);
    expect(watchlist.families.technology.cap).toBeGreaterThan(watchlist.families.market.cap);
    for (const family of FAMILIES) {
      expect(Number.isInteger(watchlist.families[family].cap)).toBe(true);
    }
  });

  it("keeps half-lives, weights and thresholds from the preset", () => {
    const { watchlist } = toWatchlist(draft(), base);

    expect(watchlist.families.money.half_life_days).toBe(base.families.money.half_life_days);
    expect(watchlist.weights).toEqual(base.weights);
    expect(watchlist.thresholds).toEqual(base.thresholds);
  });

  it("de-emphasises a family the model never mentioned rather than deleting it", () => {
    const { watchlist } = toWatchlist(draft({ emphasis: [{ family: "money", emphasis: "high" }] }), base);

    expect(watchlist.families.money.cap).toBeGreaterThan(watchlist.families.growth.cap);
    expect(watchlist.families.growth.cap).toBeGreaterThan(0);
  });
});

describe("bad output is dropped and reported", () => {
  it("rejects a family it does not know", () => {
    const { watchlist, warnings } = toWatchlist(
      draft({ emphasis: [{ family: "vibes", emphasis: "high" }] }),
      base,
    );

    expect(warnings[0]).toContain('Dropped an emphasis for "vibes"');
    expect(FAMILIES.reduce((sum, family) => sum + watchlist.families[family].cap, 0)).toBe(100);
  });

  it("rejects an emphasis word it does not know", () => {
    const { warnings } = toWatchlist(
      draft({ emphasis: [{ family: "money", emphasis: "extremely" }] }),
      base,
    );
    expect(warnings[0]).toContain("emphasis must be high, normal, low or ignore");
  });

  it("keeps the first of two emphases for the same family", () => {
    const { warnings } = toWatchlist(
      draft({
        emphasis: [
          { family: "money", emphasis: "high" },
          { family: "money", emphasis: "low" },
        ],
      }),
      base,
    );
    expect(warnings[0]).toContain("Ignored a second emphasis for money");
  });

  it("rejects an unknown function instead of guessing at it", () => {
    const { watchlist, warnings } = toWatchlist(
      draft({ relevant_functions: ["engineering", "growth hacking"] }),
      base,
    );

    expect(watchlist.relevant_functions).toEqual(["engineering"]);
    expect(warnings.some((warning) => warning.includes('"growth hacking"'))).toBe(true);
  });

  it("falls back to the preset when no function survives", () => {
    const { watchlist, warnings } = toWatchlist(draft({ relevant_functions: ["nonsense"] }), base);

    expect(watchlist.relevant_functions).toEqual(base.relevant_functions);
    expect(warnings.some((warning) => warning.includes("preset's list was kept"))).toBe(true);
  });

  it("resolves a tool listed as both competitor and complement in the safer direction", () => {
    const { watchlist, warnings } = toWatchlist(
      draft({ competitor_tools: ["Rivalytics"], complement_tools: ["Rivalytics", "Warehowse"] }),
      base,
    );

    expect(watchlist.competitor_tools).toContain("Rivalytics");
    expect(watchlist.complement_tools).not.toContain("Rivalytics");
    expect(warnings.some((warning) => warning.includes("kept it as a competitor"))).toBe(true);
  });

  it("ignores an out-of-range threshold and says so", () => {
    const { watchlist, warnings } = toWatchlist(draft({ act_now_at: 4000 }), base);

    expect(watchlist.act_now_at).toBe(base.act_now_at);
    expect(warnings.some((warning) => warning.includes("Ignored an act-now threshold"))).toBe(true);
  });

  it("keeps the preset's caps when the model ignores everything", () => {
    const { watchlist, warnings } = toWatchlist(
      draft({ emphasis: FAMILIES.map((family) => ({ family, emphasis: "ignore" })) }),
      base,
    );

    expect(warnings.some((warning) => warning.includes("Every family was set to ignore"))).toBe(true);
    for (const family of FAMILIES) {
      expect(watchlist.families[family].cap).toBe(base.families[family].cap);
    }
  });
});
