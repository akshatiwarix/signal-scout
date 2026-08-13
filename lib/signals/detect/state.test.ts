import { describe, expect, it } from "vitest";

import { DISPLACEMENT_WATCHLIST, observation, observations } from "../testing";
import { detectStateChanges } from "./state";

const watchlist = DISPLACEMENT_WATCHLIST;

describe("the first observation", () => {
  it("emits nothing, however much state it carries", () => {
    const single = [
      observation("2026-01-01", {
        headcount: 400,
        funding_stage: "series_c",
        funding_total_usd: 120_000_000,
        stack: ["Rivalytics", "Warehowse"],
        execs: [{ fn: "engineering", title: "CTO" }],
        tagline: "Something new",
      }),
    ];
    expect(detectStateChanges(single, watchlist)).toEqual([]);
  });
});

describe("funding", () => {
  it("reports a stage advance and the raise as one round", () => {
    const found = detectStateChanges(
      observations(
        ["2026-01-01", { funding_stage: "seed", funding_total_usd: 4_000_000 }],
        ["2026-02-01", { funding_stage: "series_a", funding_total_usd: 26_000_000 }],
      ),
      watchlist,
    );

    expect(found).toHaveLength(1);
    expect(found[0]!.type).toBe("funding_round");
    expect(found[0]!.subject).toBe("series_a");
    expect(found[0]!.detail).toBe("Seed → Series A, total raised up $22M");
  });

  it("ignores a stage relabelled downward and a total that only holds", () => {
    const found = detectStateChanges(
      observations(
        ["2026-01-01", { funding_stage: "series_b", funding_total_usd: 40_000_000 }],
        ["2026-02-01", { funding_stage: "series_a", funding_total_usd: 40_000_000 }],
      ),
      watchlist,
    );
    expect(found).toEqual([]);
  });

  it("anchors at the earlier crawl, so a change is never fresher than the evidence", () => {
    const found = detectStateChanges(
      observations(
        ["2026-01-01", { funding_stage: "seed" }],
        ["2026-04-01", { funding_stage: "series_a" }],
      ),
      watchlist,
    );

    expect(found[0]!.anchor).toBe("changed_at");
    expect(found[0]!.anchor_at).toBe("2026-01-01");
    expect(found[0]!.known_within_days).toBe(90);
    expect(found[0]!.detail).toContain("the crawler skipped 90 days");
  });
});

describe("headcount", () => {
  it("fires growth above the threshold and stays silent below it", () => {
    const grew = detectStateChanges(
      observations(["2026-01-01", { headcount: 100 }], ["2026-02-01", { headcount: 130 }]),
      watchlist,
    );
    expect(grew[0]!.type).toBe("headcount_growth");
    expect(grew[0]!.detail).toBe(
      "headcount 100 → 130, up 30.0% against a 15.0% threshold",
    );

    const crept = detectStateChanges(
      observations(["2026-01-01", { headcount: 100 }], ["2026-02-01", { headcount: 108 }]),
      watchlist,
    );
    expect(crept).toEqual([]);
  });

  it("fires contraction as a negative signal", () => {
    const found = detectStateChanges(
      observations(["2026-01-01", { headcount: 260 }], ["2026-02-01", { headcount: 182 }]),
      watchlist,
    );
    expect(found[0]!.type).toBe("headcount_contraction");
    expect(found[0]!.direction).toBe("negative");
    expect(found[0]!.weight_key).toBe("headcount_contraction");
  });

  it("treats a null headcount as no evidence rather than no change", () => {
    const found = detectStateChanges(
      observations(["2026-01-01", { headcount: null }], ["2026-02-01", { headcount: 400 }]),
      watchlist,
    );
    expect(found).toEqual([]);
  });
});

describe("stack", () => {
  it("reads a competitor leaving as an opening and a competitor arriving as a loss", () => {
    const dropped = detectStateChanges(
      observations(
        ["2026-01-01", { stack: ["Warehowse", "Rivalytics"] }],
        ["2026-02-01", { stack: ["Warehowse"] }],
      ),
      watchlist,
    );
    expect(dropped[0]!.type).toBe("stack_dropped");
    expect(dropped[0]!.direction).toBe("positive");
    expect(dropped[0]!.rejected).toBeNull();

    const added = detectStateChanges(
      observations(
        ["2026-01-01", { stack: ["Warehowse"] }],
        ["2026-02-01", { stack: ["Warehowse", "Rivalytics"] }],
      ),
      watchlist,
    );
    expect(added[0]!.type).toBe("stack_added");
    expect(added[0]!.direction).toBe("negative");
    expect(added[0]!.weight_key).toBe("stack_added_competitor");
  });

  it("declines a complement leaving, and says why", () => {
    const found = detectStateChanges(
      observations(
        ["2026-01-01", { stack: ["Warehowse", "Terraflow"] }],
        ["2026-02-01", { stack: ["Warehowse"] }],
      ),
      watchlist,
    );
    expect(found).toHaveLength(1);
    expect(found[0]!.rejected).toBe(
      "Terraflow is not a competitor, so its removal is not a displacement opportunity",
    );
  });

  it("declines a tool on neither list", () => {
    const found = detectStateChanges(
      observations(
        ["2026-01-01", { stack: ["Warehowse"] }],
        ["2026-02-01", { stack: ["Warehowse", "Unlisted Tool"] }],
      ),
      watchlist,
    );
    expect(found[0]!.rejected).toContain("neither the competitor nor the complement list");
  });
});

describe("execs", () => {
  it("weighs a gain and a loss differently, and only for functions on the watchlist", () => {
    const gained = detectStateChanges(
      observations(
        ["2026-01-01", { execs: [] }],
        ["2026-02-01", { execs: [{ fn: "engineering", title: "VP Engineering" }] }],
      ),
      watchlist,
    );
    expect(gained[0]!.weight_key).toBe("exec_change");
    expect(gained[0]!.detail).toBe(
      "Engineering leadership seat appeared: VP Engineering",
    );

    const lost = detectStateChanges(
      observations(
        ["2026-01-01", { execs: [{ fn: "engineering", title: "VP Engineering" }] }],
        ["2026-02-01", { execs: [] }],
      ),
      watchlist,
    );
    expect(lost[0]!.weight_key).toBe("exec_change_loss");
    expect(lost[0]!.direction).toBe("negative");

    const irrelevant = detectStateChanges(
      observations(
        ["2026-01-01", { execs: [] }],
        ["2026-02-01", { execs: [{ fn: "legal", title: "General Counsel" }] }],
      ),
      watchlist,
    );
    expect(irrelevant[0]!.rejected).toBe("Legal is not one of the functions on this watchlist");
  });
});

describe("positioning", () => {
  it("collapses several page changes in one crawl into a single signal", () => {
    const found = detectStateChanges(
      observations(
        ["2026-01-01", { tagline: "Old words", homepage_hash: "h1", pricing_page_hash: "p1" }],
        ["2026-02-01", { tagline: "New words", homepage_hash: "h2", pricing_page_hash: "p2" }],
      ),
      watchlist,
    );

    expect(found).toHaveLength(1);
    expect(found[0]!.subject).toBe("positioning");
    expect(found[0]!.magnitude).toBe(3);
    expect(found[0]!.detail).toContain('"Old words" → "New words"');
  });
});
