import { describe, expect, it } from "vitest";

import { boardJson, signalsCsv } from "./export";
import { boardAt, prepareBoard } from "./index";
import { DISPLACEMENT_WATCHLIST, jobPost, observations, TEST_ACCOUNT } from "./testing";

const history = observations(
  ["2026-01-05", { headcount: 100, funding_stage: "seed", funding_total_usd: 4_000_000 }],
  [
    "2026-02-10",
    { headcount: 150, funding_stage: "series_a", funding_total_usd: 26_000_000 },
    [
      jobPost("2026-01-20", 'Senior "Backend" Engineer'),
      jobPost("2026-01-28", "Staff Data Engineer, Platform"),
      jobPost("2026-02-01", "Security Engineer"),
      jobPost("2026-02-05", "Engineering Manager"),
    ],
  ],
);

const board = boardAt(
  prepareBoard({
    accounts: [{ ...TEST_ACCOUNT, name: 'Testfield, "Inc"' }],
    observations: history,
    watchlist: DISPLACEMENT_WATCHLIST,
  }),
  "2026-02-15",
);

describe("signals.csv", () => {
  it("is one row per live signal, with the arithmetic in the columns", () => {
    const lines = signalsCsv(board).trim().split("\n");
    const header = lines[0]!.split(",");

    expect(header).toContain("age_days");
    expect(header).toContain("half_life_days");
    expect(header).toContain("rank_multiplier");
    expect(header).toContain("points");
    expect(lines).toHaveLength(1 + board.rows[0]!.signals.length);
  });

  it("quotes fields containing commas and doubles inner quotes", () => {
    const csv = signalsCsv(board);

    expect(csv).toContain('"Testfield, ""Inc"""');
    // A detail string always contains a comma-bearing arithmetic clause.
    for (const line of csv.trim().split("\n").slice(1)) {
      expect(line.endsWith('"')).toBe(true);
    }
  });

  it("ends with a newline so it concatenates cleanly", () => {
    expect(signalsCsv(board).endsWith("\n")).toBe(true);
  });
});

describe("board.json", () => {
  it("round-trips and keeps the full evidence tree", () => {
    const parsed = JSON.parse(boardJson(board));

    expect(parsed.as_of).toBe("2026-02-15");
    expect(parsed.rows[0].signals[0].evidence.length).toBeGreaterThan(0);
    expect(parsed.rows[0].families).toHaveLength(5);
  });
});
