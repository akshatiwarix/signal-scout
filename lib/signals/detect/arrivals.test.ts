import { describe, expect, it } from "vitest";

import { DISPLACEMENT_WATCHLIST, jobPost, observations, release } from "../testing";
import { detectArrivals } from "./arrivals";

const watchlist = DISPLACEMENT_WATCHLIST;

const empty = {};

describe("hiring surge", () => {
  it("counts posts over a trailing window rather than per crawl", () => {
    // Three posts in one crawl and two in the next: no single crawl reaches four, but
    // the 45-day window does. Counting per crawl would miss this surge entirely.
    const found = detectArrivals(
      observations(
        ["2026-01-01", empty],
        [
          "2026-02-01",
          empty,
          [
            jobPost("2026-01-10", "Senior Backend Engineer"),
            jobPost("2026-01-18", "Staff Platform Engineer"),
            jobPost("2026-01-25", "Engineering Manager"),
          ],
        ],
        ["2026-02-20", empty, [jobPost("2026-02-10", "Senior Backend Engineer")]],
      ),
      watchlist,
    );

    const surges = found.filter((detection) => detection.type === "hiring_surge");
    expect(surges).toHaveLength(1);
    expect(surges[0]!.magnitude).toBe(4);
    expect(surges[0]!.detail).toBe(
      "4 job posts in the 45 days to 2026-02-20, against a threshold of 4",
    );
  });

  it("anchors on the freshest evidence, not the first sighting", () => {
    const found = detectArrivals(
      observations(
        ["2026-01-01", empty],
        [
          "2026-02-01",
          empty,
          [
            jobPost("2026-01-05", "Senior Backend Engineer"),
            jobPost("2026-01-09", "Analytics Engineer"),
            jobPost("2026-01-20", "Security Engineer"),
            jobPost("2026-01-28", "Engineering Manager"),
          ],
        ],
      ),
      watchlist,
    );

    const surge = found.find((detection) => detection.type === "hiring_surge");
    expect(surge?.anchor).toBe("last_evidence_at");
    expect(surge?.anchor_at).toBe("2026-01-28");
    expect(surge?.known_within_days).toBe(0);
  });
});

describe("key roles", () => {
  it("groups posts by function and marks the ones off the watchlist", () => {
    const found = detectArrivals(
      observations(
        ["2026-01-01", empty],
        [
          "2026-02-01",
          empty,
          [
            jobPost("2026-01-10", "Staff Data Engineer"),
            jobPost("2026-01-12", "Analytics Engineer"),
            jobPost("2026-01-14", "Enterprise Account Executive"),
          ],
        ],
      ),
      watchlist,
    );

    const roles = found.filter((detection) => detection.type === "key_role_opened");
    const data = roles.find((detection) => detection.subject === "data");
    const sales = roles.find((detection) => detection.subject === "sales");

    expect(data?.magnitude).toBe(2);
    expect(data?.rejected).toBeNull();
    expect(data?.detail).toBe("2 open roles in Data, a function on this watchlist");
    expect(sales?.rejected).toBe("Sales is not one of the functions on this watchlist");
  });

  it("reports an unplaceable title instead of filing it under engineering", () => {
    const found = detectArrivals(
      observations(
        ["2026-01-01", empty],
        ["2026-02-01", empty, [jobPost("2026-01-10", "Chief of Staff to the Founders")]],
      ),
      watchlist,
    );

    const unplaced = found.find((detection) => detection.subject === "unplaced");
    expect(unplaced?.rejected).toBe(
      "the title keyword table could not assign these posts to a function",
    );
  });
});

describe("launches", () => {
  it("is one signal per release, dated by the release itself", () => {
    const found = detectArrivals(
      observations(
        ["2026-01-01", empty],
        ["2026-02-01", empty, [release("2026-01-11", "Widget 2.0"), release("2026-01-22", "Mobile app")]],
      ),
      watchlist,
    );

    const launches = found.filter((detection) => detection.type === "product_launch");
    expect(launches.map((detection) => detection.subject)).toEqual(["Widget 2.0", "Mobile app"]);
    expect(launches[1]!.anchor_at).toBe("2026-01-22");
  });
});

describe("the first crawl", () => {
  it("discards items seen at discovery, because a backlog is not an arrival", () => {
    const found = detectArrivals(
      observations([
        "2026-01-01",
        empty,
        [
          jobPost("2025-11-01", "Senior Backend Engineer"),
          jobPost("2025-11-08", "Staff Data Engineer"),
          jobPost("2025-12-02", "Security Engineer"),
          jobPost("2025-12-19", "Analytics Engineer"),
          release("2025-12-20", "Ancient release"),
        ],
      ]),
      watchlist,
    );

    expect(found).toEqual([]);
  });
});
