import { describe, expect, test } from "bun:test";

import {
  isDueMonthEligible,
  todayYmdInTimezone,
  ymdYearMonth,
} from "./calendar-dates";

describe("isDueMonthEligible", () => {
  test("allows due dates earlier in the same month", () => {
    expect(isDueMonthEligible("2026-06-29", "2026-06-30")).toBe(true);
    expect(isDueMonthEligible("2026-06-01", "2026-06-30")).toBe(true);
  });

  test("allows due dates in future months", () => {
    expect(isDueMonthEligible("2026-07-15", "2026-06-30")).toBe(true);
  });

  test("skips due dates in past months", () => {
    expect(isDueMonthEligible("2026-05-29", "2026-06-30")).toBe(false);
    expect(isDueMonthEligible("2025-12-31", "2026-06-30")).toBe(false);
  });
});

describe("todayYmdInTimezone", () => {
  test("returns YYYY-MM-DD", () => {
    expect(todayYmdInTimezone("Asia/Manila")).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});

describe("ymdYearMonth", () => {
  test("extracts year-month", () => {
    expect(ymdYearMonth("2026-06-29")).toBe("2026-06");
  });
});
