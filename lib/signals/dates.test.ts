import { describe, expect, it } from "vitest";

import { addDays, compareDates, daysBetween, earliest, isIsoDate, latest } from "./dates";

describe("date arithmetic", () => {
  it("counts whole days between calendar dates", () => {
    expect(daysBetween("2026-01-01", "2026-01-31")).toBe(30);
    expect(daysBetween("2026-01-31", "2026-01-01")).toBe(-30);
    expect(daysBetween("2026-03-14", "2026-03-14")).toBe(0);
  });

  it("crosses a DST boundary without drifting", () => {
    // US DST starts 2026-03-08. Parsing as UTC midnight is what keeps this 31 and
    // not 30.958…, which would round a signal's age wrong for half the year.
    expect(daysBetween("2026-03-01", "2026-04-01")).toBe(31);
    expect(addDays("2026-03-07", 1)).toBe("2026-03-08");
  });

  it("handles a leap day", () => {
    expect(addDays("2028-02-28", 1)).toBe("2028-02-29");
    expect(daysBetween("2028-02-28", "2028-03-01")).toBe(2);
  });

  it("rejects anything that is not a date-only ISO string", () => {
    expect(isIsoDate("2026-03-14")).toBe(true);
    expect(isIsoDate("2026-03-14T00:00:00Z")).toBe(false);
    expect(isIsoDate("2026-3-14")).toBe(false);
    expect(isIsoDate("2026-02-31")).toBe(false);
  });

  it("finds bounds and orders ascending", () => {
    const dates = ["2026-05-01", "2026-01-09", "2026-03-22"];
    expect(earliest(dates)).toBe("2026-01-09");
    expect(latest(dates)).toBe("2026-05-01");
    expect([...dates].sort(compareDates)).toEqual([
      "2026-01-09",
      "2026-03-22",
      "2026-05-01",
    ]);
    expect(earliest([])).toBeNull();
  });
});
