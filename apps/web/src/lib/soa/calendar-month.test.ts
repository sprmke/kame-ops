import { describe, expect, test } from "bun:test";

import {
  calendarMonthFromSoaDates,
  closestMonthInRange,
  enumerateCalendarMonths,
  isMonthInInclusiveRange,
} from "./calendar-month";

describe("calendarMonthFromSoaDates", () => {
  test("uses statement date month", () => {
    expect(calendarMonthFromSoaDates("Mar 12, 2026", "Apr 08, 2026")).toEqual({
      month: 3,
      year: 2026,
    });
  });

  test("falls back to due date", () => {
    expect(calendarMonthFromSoaDates("—", "Apr 08, 2026")).toEqual({
      month: 4,
      year: 2026,
    });
  });

  test("parses ISO dates from AI", () => {
    expect(calendarMonthFromSoaDates("2026-07-15")).toEqual({
      month: 7,
      year: 2026,
    });
  });

  test("rejects overflowing calendar dates", () => {
    expect(calendarMonthFromSoaDates("Feb 31, 2026")).toBeNull();
    expect(calendarMonthFromSoaDates("2026-02-31", "Apr 08, 2026")).toEqual({
      month: 4,
      year: 2026,
    });
  });
});

describe("enumerateCalendarMonths", () => {
  test("spans year boundary", () => {
    expect(
      enumerateCalendarMonths(
        { month: 11, year: 2025 },
        { month: 2, year: 2026 },
      ),
    ).toEqual([
      { month: 11, year: 2025 },
      { month: 12, year: 2025 },
      { month: 1, year: 2026 },
      { month: 2, year: 2026 },
    ]);
  });
});

describe("isMonthInInclusiveRange", () => {
  test("includes endpoints", () => {
    const from = { month: 1, year: 2026 };
    const to = { month: 3, year: 2026 };
    expect(isMonthInInclusiveRange({ month: 1, year: 2026 }, from, to)).toBe(
      true,
    );
    expect(isMonthInInclusiveRange({ month: 3, year: 2026 }, from, to)).toBe(
      true,
    );
    expect(isMonthInInclusiveRange({ month: 4, year: 2026 }, from, to)).toBe(
      false,
    );
  });
});

describe("closestMonthInRange", () => {
  test("picks the nearest period month", () => {
    const months = enumerateCalendarMonths(
      { month: 1, year: 2026 },
      { month: 3, year: 2026 },
    );
    expect(closestMonthInRange({ month: 5, year: 2026 }, months)).toEqual({
      month: 3,
      year: 2026,
    });
    expect(closestMonthInRange(null, months)).toEqual({
      month: 1,
      year: 2026,
    });
  });
});
