import { describe, expect, it } from "vitest";

import { DISPLACEMENT_WATCHLIST, jobPost, observations } from "../testing";
import { detectArrivals } from "./arrivals";
import { assignIdentity } from "./identity";
import { detectStateChanges } from "./state";

const watchlist = DISPLACEMENT_WATCHLIST;
const empty = {};

describe("folding", () => {
  it("turns a state change re-seen at every later crawl into one signal", () => {
    // The round closed once. Three later crawls all still show Series A; a feed would
    // publish that three more times.
    const history = observations(
      ["2026-01-01", { funding_stage: "seed" }],
      ["2026-02-01", { funding_stage: "series_a" }],
      ["2026-03-01", { funding_stage: "series_a" }],
      ["2026-04-01", { funding_stage: "series_a" }],
    );

    const { signals } = assignIdentity(detectStateChanges(history, watchlist), watchlist);
    expect(signals).toHaveLength(1);
    expect(signals[0]!.key).toBe("t001:funding_round:series_a");
  });

  it("never moves a state change's anchor, however often it is re-observed", () => {
    const history = observations(
      ["2026-01-01", { headcount: 100 }],
      ["2026-02-01", { headcount: 150 }],
      ["2026-02-20", { headcount: 150 }],
    );

    const { signals } = assignIdentity(detectStateChanges(history, watchlist), watchlist);
    expect(signals).toHaveLength(1);
    expect(signals[0]!.anchor_at).toBe("2026-01-01");
  });

  it("advances an arrival's anchor while the pattern keeps clearing the threshold", () => {
    const history = observations(
      ["2026-01-01", empty],
      [
        "2026-02-01",
        empty,
        [
          jobPost("2026-01-05", "Senior Backend Engineer"),
          jobPost("2026-01-09", "Staff Platform Engineer"),
          jobPost("2026-01-14", "Engineering Manager"),
          jobPost("2026-01-20", "Senior Backend Engineer"),
        ],
      ],
      [
        "2026-02-25",
        empty,
        [
          jobPost("2026-02-10", "Staff Platform Engineer"),
          jobPost("2026-02-14", "Engineering Manager"),
          jobPost("2026-02-18", "Senior Backend Engineer"),
        ],
      ],
    );

    const { signals } = assignIdentity(detectArrivals(history, watchlist), watchlist);
    const surge = signals.find((signal) => signal.type === "hiring_surge");

    // Anchor tracks the freshest post, so this signal has not aged at all since
    // February despite having started in January.
    expect(surge?.anchor_at).toBe("2026-02-18");
    expect(surge?.evidence).toHaveLength(7);
    expect(surge?.detail).toContain("still producing evidence");
  });

  it("lets an arrival go cold once the pattern stops clearing the threshold", () => {
    // Four posts in January, one in February. The trailing window no longer holds four,
    // so there is nothing to fold: the original surge stands and keeps ageing from
    // January. "Still hot" has to mean still surging, or the anchor rule would let one
    // straggling post keep a dead surge alive forever.
    const history = observations(
      ["2026-01-01", empty],
      [
        "2026-02-01",
        empty,
        [
          jobPost("2026-01-05", "Senior Backend Engineer"),
          jobPost("2026-01-09", "Staff Platform Engineer"),
          jobPost("2026-01-14", "Engineering Manager"),
          jobPost("2026-01-20", "Senior Backend Engineer"),
        ],
      ],
      ["2026-02-25", empty, [jobPost("2026-02-18", "Staff Platform Engineer")]],
    );

    const { signals } = assignIdentity(detectArrivals(history, watchlist), watchlist);
    const surge = signals.find((signal) => signal.type === "hiring_surge");

    expect(surge?.anchor_at).toBe("2026-01-20");
    expect(surge?.magnitude).toBe(4);
  });
});

describe("escalation", () => {
  it("re-fires when magnitude doubles, with a fresh anchor and a #2 key", () => {
    const four = Array.from({ length: 4 }, (_, i) =>
      jobPost(`2026-01-0${i + 2}`, "Senior Backend Engineer"),
    );
    const fourteen = Array.from({ length: 14 }, (_, i) =>
      jobPost(`2026-03-${String(i + 2).padStart(2, "0")}`, "Staff Platform Engineer"),
    );

    const history = observations(
      ["2026-01-01", empty],
      ["2026-01-20", empty, four],
      ["2026-03-20", empty, fourteen],
    );

    const { signals } = assignIdentity(detectArrivals(history, watchlist), watchlist);
    const surges = signals
      .filter((signal) => signal.type === "hiring_surge")
      .sort((a, b) => a.key.localeCompare(b.key));

    expect(surges.map((signal) => signal.key)).toEqual([
      "t001:hiring_surge:hiring",
      "t001:hiring_surge:hiring#2",
    ]);
    expect(surges[1]!.magnitude).toBe(14);
    expect(surges[1]!.detail).toContain("re-fired as occurrence 2");
  });
});

describe("the refractory window", () => {
  it("opens a new occurrence when the same identity returns long afterwards", () => {
    // Two separate 30% jumps, five months apart. One signal would understate it and a
    // fold would date the second one in January.
    const history = observations(
      ["2026-01-01", { headcount: 100 }],
      ["2026-02-01", { headcount: 130 }],
      ["2026-07-01", { headcount: 130 }],
      ["2026-08-01", { headcount: 170 }],
    );

    const { signals } = assignIdentity(detectStateChanges(history, watchlist), watchlist);
    const growth = signals
      .filter((signal) => signal.type === "headcount_growth")
      .sort((a, b) => a.key.localeCompare(b.key));

    expect(growth).toHaveLength(2);
    expect(growth[1]!.anchor_at).toBe("2026-07-01");
  });

  it("keeps keys unique across every occurrence", () => {
    const history = observations(
      ["2026-01-01", { headcount: 100 }],
      ["2026-02-01", { headcount: 130 }],
      ["2026-07-01", { headcount: 130 }],
      ["2026-08-01", { headcount: 170 }],
    );

    const { signals } = assignIdentity(detectStateChanges(history, watchlist), watchlist);
    expect(new Set(signals.map((signal) => signal.key)).size).toBe(signals.length);
  });
});

describe("rejections", () => {
  it("keeps declined detections out of the score but on the record", () => {
    const history = observations(
      ["2026-01-01", { stack: ["Warehowse", "Terraflow"] }],
      ["2026-02-01", { stack: ["Warehowse"] }],
    );

    const { signals, rejected } = assignIdentity(
      detectStateChanges(history, watchlist),
      watchlist,
    );

    expect(signals).toEqual([]);
    expect(rejected).toHaveLength(1);
    expect(rejected[0]!.reason).toContain("not a competitor");
    expect(rejected[0]!.signal.key).toBe("t001:stack_dropped:Terraflow");
  });
});

describe("weights", () => {
  it("takes the sign from the direction, not from the watchlist number", () => {
    const history = observations(
      ["2026-01-01", { headcount: 200 }],
      ["2026-02-01", { headcount: 140 }],
    );

    const { signals } = assignIdentity(detectStateChanges(history, watchlist), watchlist);
    expect(watchlist.weights.headcount_contraction).toBe(18);
    expect(signals[0]!.raw).toBe(-18);
  });
});
