import { describe, expect, it } from "vitest";

import {
  expectedDueDateCandidates,
  expectedDueDateYmd,
  isValidDueDay,
} from "./expected-due";

describe("expectedDueDateYmd", () => {
  it("uses the configured day in a normal month", () => {
    expect(expectedDueDateYmd(2026, 8, 25)).toBe("2026-08-25");
  });

  it("clamps day 31 to the last day of shorter months", () => {
    expect(expectedDueDateYmd(2026, 4, 31)).toBe("2026-04-30");
    expect(expectedDueDateYmd(2026, 2, 31)).toBe("2026-02-28");
    expect(expectedDueDateYmd(2028, 2, 31)).toBe("2028-02-29");
  });

  it("validates the supported day range", () => {
    expect(isValidDueDay(1)).toBe(true);
    expect(isValidDueDay(31)).toBe(true);
    expect(isValidDueDay(0)).toBe(false);
    expect(isValidDueDay(32)).toBe(false);
  });
});

describe("expectedDueDateCandidates", () => {
  it("includes the next month near a month boundary", () => {
    expect(expectedDueDateCandidates("2026-08-29", 2)).toEqual([
      "2026-07-02",
      "2026-08-02",
      "2026-09-02",
    ]);
  });

  it("includes the prior month for an overdue month-boundary fallback", () => {
    expect(expectedDueDateCandidates("2027-01-01", 31)).toEqual([
      "2026-12-31",
      "2027-01-31",
      "2027-02-28",
    ]);
  });
});
