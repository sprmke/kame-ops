import { describe, expect, test } from "bun:test";

import { parseDueDateToYmd } from "./parse-due-date";

describe("parseDueDateToYmd", () => {
  test("parses display and ISO dates", () => {
    expect(parseDueDateToYmd("Apr 08, 2026")).toBe("2026-04-08");
    expect(parseDueDateToYmd("2026-04-08")).toBe("2026-04-08");
    expect(parseDueDateToYmd("8 Apr 2026")).toBe("2026-04-08");
  });

  test("rejects blanks and overflow dates", () => {
    expect(parseDueDateToYmd("—")).toBeNull();
    expect(parseDueDateToYmd("")).toBeNull();
    expect(parseDueDateToYmd("Feb 31, 2026")).toBeNull();
    expect(parseDueDateToYmd("2026-02-31")).toBeNull();
  });
});
