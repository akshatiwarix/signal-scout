import { describe, expect, it } from "vitest";

import { lifecycleOf, rankRows } from "./rank";
import type { BoardRow } from "./types";

describe("lifecycle", () => {
  it("separates an account that went cold from one that never did anything", () => {
    const stale = lifecycleOf({ total: 0, live: 0, ever: 3, trend: 0 });
    const quiet = lifecycleOf({ total: 0, live: 0, ever: 0, trend: 0 });

    expect(stale).toBe("stale");
    expect(quiet).toBe("quiet");
  });

  it("calls a zero total with live signals steady, not stale", () => {
    // A positive and a negative can cancel while both are perfectly current. Keying stale
    // on `total === 0` would mislabel exactly the most interesting account on the board.
    expect(lifecycleOf({ total: 0, live: 2, ever: 2, trend: 0 })).toBe("steady");
  });

  it("puts contraction ahead of every other label", () => {
    expect(lifecycleOf({ total: -12, live: 1, ever: 4, trend: 5 })).toBe("contracting");
  });

  it("reads direction from the trend window", () => {
    expect(lifecycleOf({ total: 30, live: 2, ever: 2, trend: 8 })).toBe("rising");
    expect(lifecycleOf({ total: 30, live: 2, ever: 2, trend: -8 })).toBe("cooling");
    expect(lifecycleOf({ total: 30, live: 2, ever: 2, trend: 0 })).toBe("steady");
  });
});

function row(name: string, total: number, fit: number): BoardRow {
  return {
    account: {
      id: name,
      name,
      domain: `${name}.example`,
      industry: "Testing",
      fit: { score: fit, band: "moderate" },
    },
    total,
    denominator: 100,
    families: [],
    signals: [],
    dropped: [],
    state: "steady",
    trend: 0,
    sparkline: [],
  };
}

describe("ranking", () => {
  it("orders by score, breaks ties on fit, and then on name", () => {
    const ranked = rankRows([
      row("Cedar", 38, 60),
      row("Alder", 38, 91),
      row("Birch", 52, 40),
      row("Dogwood", 38, 91),
      row("Elm", -9, 95),
    ]);

    expect(ranked.map((entry) => entry.account.name)).toEqual([
      "Birch",
      "Alder",
      "Dogwood",
      "Cedar",
      "Elm",
    ]);
  });

  it("sinks a contracting account below a silent one", () => {
    const ranked = rankRows([row("Loud", -14, 95), row("Silent", 0, 20)]);
    expect(ranked.map((entry) => entry.account.name)).toEqual(["Silent", "Loud"]);
  });
});
