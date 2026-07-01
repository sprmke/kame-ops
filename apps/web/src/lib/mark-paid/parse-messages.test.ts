import { describe, expect, it } from "vitest";

import { parseMonthYear } from "@/lib/mark-paid/parse-messages";

describe("parseMonthYear", () => {
  it("parses month name and year", () => {
    expect(parseMonthYear("april 2026")).toBe("2026-04");
    expect(parseMonthYear("Apr 2026")).toBe("2026-04");
  });

  it("parses ISO month", () => {
    expect(parseMonthYear("2026-04")).toBe("2026-04");
  });

  it("returns null for invalid input", () => {
    expect(parseMonthYear("not-a-month")).toBeNull();
    expect(parseMonthYear("")).toBeNull();
  });
});
