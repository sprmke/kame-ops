import { describe, expect, test } from "bun:test";

import { alignManualUploadMonth } from "./manual-upload-align";

const march = { month: 3, year: 2026 };
const april = { month: 4, year: 2026 };
const jan = { month: 1, year: 2026 };

describe("alignManualUploadMonth", () => {
  test("picks detected month inside a multi-month period", () => {
    const result = alignManualUploadMonth({
      detected: march,
      periodFrom: jan,
      periodTo: april,
    });
    expect(result).toEqual({ kind: "ok", month: march, outOfRange: false });
  });

  test("flags misalignment vs a single-month period", () => {
    const result = alignManualUploadMonth({
      detected: april,
      periodFrom: march,
      periodTo: march,
    });
    expect(result).toEqual({
      kind: "needs_confirmation",
      reason: "out_of_range",
      detected: april,
    });
  });

  test("saves out of range when allowed", () => {
    const result = alignManualUploadMonth({
      detected: april,
      periodFrom: march,
      periodTo: march,
      allowOutOfRange: true,
    });
    expect(result).toEqual({ kind: "ok", month: april, outOfRange: true });
  });

  test("force month attaches to the current period", () => {
    const result = alignManualUploadMonth({
      detected: april,
      periodFrom: march,
      periodTo: march,
      force: march,
    });
    expect(result).toEqual({ kind: "ok", month: march, outOfRange: false });
  });

  test("unknown month needs confirmation", () => {
    const result = alignManualUploadMonth({
      detected: null,
      periodFrom: march,
      periodTo: march,
    });
    expect(result.kind).toBe("needs_confirmation");
    if (result.kind === "needs_confirmation") {
      expect(result.reason).toBe("unknown_month");
    }
  });

  test("ignores invalid force month", () => {
    const result = alignManualUploadMonth({
      detected: april,
      periodFrom: march,
      periodTo: march,
      force: { month: 13, year: 2026 },
    });
    expect(result.kind).toBe("needs_confirmation");
  });

  test("force without allowOutOfRange still needs confirmation when outside", () => {
    const result = alignManualUploadMonth({
      detected: march,
      periodFrom: march,
      periodTo: march,
      force: jan,
    });
    expect(result).toEqual({
      kind: "needs_confirmation",
      reason: "out_of_range",
      detected: jan,
    });
  });
});
