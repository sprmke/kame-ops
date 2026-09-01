import { describe, expect, test } from "bun:test";

import { detectIssuerFromSoaText } from "./detect-issuer";

describe("detectIssuerFromSoaText", () => {
  test("detects metrobank", () => {
    expect(
      detectIssuerFromSoaText("Metrobank Credit Card MSOA Statement"),
    ).toBe("metrobank");
  });

  test("detects rcbc", () => {
    expect(detectIssuerFromSoaText("RCBC FLEX VISA eStatement")).toBe("rcbc");
  });

  test("detects bpi", () => {
    expect(
      detectIssuerFromSoaText(
        "BPI Credit Card Electronic Statement of Account",
      ),
    ).toBe("bpi");
  });

  test("detects unionbank", () => {
    expect(
      detectIssuerFromSoaText("Unionbank REWARDS VISA PLATINUM e-Statement"),
    ).toBe("unionbank");
  });

  test("returns null when unknown", () => {
    expect(detectIssuerFromSoaText("Random shopping receipt")).toBeNull();
  });
});
