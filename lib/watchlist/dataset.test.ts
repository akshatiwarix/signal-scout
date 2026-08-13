import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { ACCOUNTS, CRAWL_DATES, DEFAULT_AS_OF, OBSERVATIONS } from "@/data/dataset";
import { daysBetween } from "@/lib/signals/dates";
import type { Observation } from "@/lib/signals/types";

/**
 * Pins the engineered distribution. Every assertion here is hand-rolled — no engine
 * calls — so that flattening the dataset fails a test rather than quietly making the
 * demo boring. Day 001 learned this the same way.
 */

function forAccount(id: string): Observation[] {
  return OBSERVATIONS.filter((observation) => observation.account_id === id).sort((a, b) =>
    a.observed_at.localeCompare(b.observed_at),
  );
}

function at(id: string, index: number): Observation {
  const observation = forAccount(id)[index];
  if (!observation) throw new Error(`${id} has no observation at index ${index}`);
  return observation;
}

function jobPostCount(observation: Observation): number {
  return observation.items.filter((item) => item.kind === "job_post").length;
}

describe("dataset shape", () => {
  it("is 40 accounts over 12 crawl dates", () => {
    expect(ACCOUNTS).toHaveLength(40);
    expect(CRAWL_DATES).toHaveLength(12);
    expect(DEFAULT_AS_OF).toBe("2026-08-12");
    expect(daysBetween(CRAWL_DATES[0]!, DEFAULT_AS_OF)).toBe(173);
  });

  it("uses reserved .example domains everywhere", () => {
    for (const account of ACCOUNTS) expect(account.domain.endsWith(".example")).toBe(true);
  });

  it("keeps a spread of fit bands so the quadrant view has all four corners", () => {
    const bands = new Set(ACCOUNTS.map((account) => account.fit.band));
    expect(bands).toEqual(new Set(["strong", "moderate", "weak"]));
  });

  /**
   * The central claim, enforced on the raw bytes: the input contains no event
   * labels. If this fails, someone has started shipping answers in the dataset and
   * the engine is no longer deriving anything.
   */
  it("contains no event labels in the raw JSON", () => {
    const raw = readFileSync(join(process.cwd(), "data", "observations.json"), "utf8");
    for (const forbidden of [
      "signal",
      "funding_round",
      "layoff",
      "event",
      "trigger",
      "score",
      "competitor",
      "category",
    ]) {
      expect(raw.toLowerCase()).not.toContain(forbidden);
    }
  });
});

describe("the ten engineered rows", () => {
  it("a001 is noisy in exactly one family: four releases and four page changes", () => {
    const observations = forAccount("a001");
    const releases = observations.flatMap((observation) =>
      observation.items.filter((item) => item.kind === "release"),
    );
    expect(releases.length).toBeGreaterThanOrEqual(4);

    const hashes = new Set(observations.map((observation) => observation.state.homepage_hash));
    expect(hashes.size).toBeGreaterThanOrEqual(4);
    // Clustered late, so the family cap has to do the work rather than decay.
    expect(releases.filter((item) => item.observed_at >= "2026-07-01").length).toBeGreaterThanOrEqual(4);

    // …and nothing in the families that would justify the attention.
    expect(observations.every((observation) => jobPostCount(observation) === 0)).toBe(true);
  });

  it("a002 gains an engineering seat and then hires behind it", () => {
    const before = at("a002", 8).state.execs.map((seat) => seat.fn);
    const after = at("a002", 9).state.execs.map((seat) => seat.fn);
    expect(before).not.toContain("engineering");
    expect(after).toContain("engineering");
    expect(jobPostCount(at("a002", 9))).toBeGreaterThanOrEqual(5);
    expect(at("a002", 9).state.headcount).toBeGreaterThan(at("a002", 8).state.headcount!);
  });

  it("a003 is the best fit on the board and has never done anything", () => {
    const observations = forAccount("a003");
    expect(observations).toHaveLength(12);
    const account = ACCOUNTS.find((candidate) => candidate.id === "a003");
    expect(account?.fit.score).toBe(95);

    const first = JSON.stringify(observations[0]!.state);
    for (const observation of observations) {
      expect(JSON.stringify(observation.state)).toBe(first);
      expect(observation.items).toEqual([]);
    }
  });

  it("a004 is a strong fit that sheds 30% of its headcount", () => {
    const account = ACCOUNTS.find((candidate) => candidate.id === "a004");
    expect(account?.fit.band).toBe("strong");
    const before = at("a004", 9).state.headcount!;
    const after = at("a004", 10).state.headcount!;
    expect((before - after) / before).toBeGreaterThan(0.25);
  });

  it("a005 has an 89-day hole with a funding round somewhere inside it", () => {
    const observations = forAccount("a005");
    expect(observations).toHaveLength(8);
    const gapStart = observations[6]!;
    const gapEnd = observations[7]!;
    expect(daysBetween(gapStart.observed_at, gapEnd.observed_at)).toBe(89);
    expect(gapStart.state.funding_stage).toBe("series_a");
    expect(gapEnd.state.funding_stage).toBe("series_b");
  });

  it("a006 is first observed at the fifth crawl", () => {
    const observations = forAccount("a006");
    expect(observations).toHaveLength(5);
    expect(observations[0]!.observed_at).toBe("2026-06-12");
  });

  it("a007 escalates its hiring by more than the escalation factor", () => {
    const first = jobPostCount(at("a007", 6));
    const later = jobPostCount(at("a007", 9));
    expect(first).toBe(4);
    expect(later).toBe(14);
    expect(later / first).toBeGreaterThanOrEqual(2);
  });

  it("a008's round landed 89 days before the default as-of date", () => {
    const before = at("a008", 6);
    const after = at("a008", 7);
    expect(before.state.funding_stage).toBe("seed");
    expect(after.state.funding_stage).toBe("series_a");
    // Anchored at the crawl before, which is exactly 89 days before the default as-of.
    expect(daysBetween(before.observed_at, DEFAULT_AS_OF)).toBe(89);
  });

  it("a009's only activity is far outside the market horizon", () => {
    const observations = forAccount("a009");
    const active = observations.filter((observation) => observation.items.length > 0);
    expect(active).toHaveLength(1);
    // Market half-life is 21 days, horizon 4 half-lives — 84 days. This is well past.
    expect(daysBetween(active[0]!.observed_at, DEFAULT_AS_OF)).toBeGreaterThan(84);
  });

  it("a010 and a011 are the same account with the same delta in opposite directions", () => {
    const droppedBefore = at("a010", 9).state.stack;
    const droppedAfter = at("a010", 10).state.stack;
    const addedBefore = at("a011", 9).state.stack;
    const addedAfter = at("a011", 10).state.stack;

    expect(droppedBefore).toContain("Rivalytics");
    expect(droppedAfter).not.toContain("Rivalytics");
    expect(addedBefore).not.toContain("Rivalytics");
    expect(addedAfter).toContain("Rivalytics");

    // Everything else about the pair matches, so the board's difference has exactly
    // one cause.
    expect(droppedAfter).toEqual(addedBefore);
    expect(at("a010", 10).state.headcount).toBe(at("a011", 10).state.headcount);
  });
});
