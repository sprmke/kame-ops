import { describe, expect, test } from "bun:test";

import {
  assessSoaTextQuality,
  looksGarbled,
  pickBetterSoaText,
  soaTextLooksUsable,
} from "./text-quality";

const METROBANK_SAMPLE = `
Metrobank M Free Mastercard
Statement Date Payment Due Date
4 March 2026 25 March 2026
Total Amount Due Minimum Amount Due PHP 12,345.67 PHP 1,500.00
03/01 03/02 SHOPEE PH ONLINE 1,234.56
03/05 03/06 GRAB TRANSPORT 250.00
`;

const RCBC_SAMPLE = `
RCBC Bankard Flex Visa
STATEMENT DATE PAYMENT DUE DATE JAN 04 2026 JAN 25 2026
TOTAL BALANCE DUE MINIMUM PAYMENT DUE P 20,000.00 P 2,000.00
01/02/26 01/03/26 SPOTIFY PHILIPPINES 169.00
`;

const UNIONBANK_SAMPLE = `
Unionbank Rewards Visa
Statement Date: Jan 23, 2026
Payment Due Date: Feb 09, 2026
Statement Balance: PHP 5,000.00
Minimum Amount Due: PHP 500.00
01/05/26 01/06/26 NETFLIX.COM 549.00
`;

/** Simulates a broken/subset-font PDF extract: control chars + repeated punctuation runs, no real amounts/dates. */
const GARBLED_SAMPLE =
  "\u0001\u0002()()()()()()\uFFFD\uFFFD\uFFFD" + "Q_U".repeat(20);

describe("assessSoaTextQuality", () => {
  test("flags real bank statement excerpts as usable (Metrobank, RCBC, Unionbank)", () => {
    for (const sample of [METROBANK_SAMPLE, RCBC_SAMPLE, UNIONBANK_SAMPLE]) {
      const quality = assessSoaTextQuality(sample);
      expect(quality.looksUsable).toBe(true);
      expect(quality.reasons).toEqual([]);
      expect(quality.moneyTokenCount).toBeGreaterThan(0);
      expect(quality.dateTokenCount).toBeGreaterThan(0);
    }
  });

  test("flags empty text as unusable", () => {
    const quality = assessSoaTextQuality("");
    expect(quality.looksUsable).toBe(false);
    expect(quality.reasons).toContain("too little text extracted");
  });

  test("flags null/undefined text as unusable without throwing", () => {
    expect(assessSoaTextQuality(null).looksUsable).toBe(false);
    expect(assessSoaTextQuality(undefined).looksUsable).toBe(false);
  });

  test("flags garbled/broken-font text as unusable regardless of issuer", () => {
    const quality = assessSoaTextQuality(GARBLED_SAMPLE);
    expect(quality.looksUsable).toBe(false);
    expect(quality.reasons.length).toBeGreaterThan(0);
  });

  test("flags plausible-length prose with no money/date tokens as unusable", () => {
    const prose =
      "This statement could not be rendered because the source PDF uses an embedded font that does not map to readable text at all in this particular extraction pass.";
    const quality = assessSoaTextQuality(prose);
    expect(quality.looksUsable).toBe(false);
    expect(quality.reasons).toContain("no peso amounts found");
    expect(quality.reasons).toContain("no dates found");
  });
});

describe("soaTextLooksUsable", () => {
  test("is a boolean shorthand for assessSoaTextQuality", () => {
    expect(soaTextLooksUsable(RCBC_SAMPLE)).toBe(true);
    expect(soaTextLooksUsable(GARBLED_SAMPLE)).toBe(false);
  });
});

describe("looksGarbled", () => {
  test("does not flag a real statement footer divider as garbled", () => {
    const footer = "********** END OF STATEMENT **********";
    expect(looksGarbled(footer)).toBe(false);
  });

  test("does not flag a short transaction-line slice lacking money/date tokens", () => {
    // A geometry-reordered RCBC slice can legitimately be narrow like this —
    // looksGarbled must not require money/date tokens the way assessSoaTextQuality does.
    const slice = "SPOTIFY PHILIPPINES SUBSCRIPTION MONTHLY PLAN RENEWAL FEE";
    expect(looksGarbled(slice)).toBe(false);
  });

  test("flags broken-font glyph substitution runs as garbled", () => {
    expect(looksGarbled(GARBLED_SAMPLE)).toBe(true);
  });

  test("flags empty/null/undefined text as garbled", () => {
    expect(looksGarbled("")).toBe(true);
    expect(looksGarbled(null)).toBe(true);
    expect(looksGarbled(undefined)).toBe(true);
  });
});

describe("pickBetterSoaText", () => {
  test("keeps current text when it already looks usable (skips OCR result)", () => {
    const result = pickBetterSoaText(METROBANK_SAMPLE, "some other OCR text");
    expect(result.usedCandidate).toBe(false);
    expect(result.text).toBe(METROBANK_SAMPLE);
  });

  test("switches to OCR candidate when current is garbled and candidate is usable", () => {
    const result = pickBetterSoaText(GARBLED_SAMPLE, UNIONBANK_SAMPLE);
    expect(result.usedCandidate).toBe(true);
    expect(result.text).toBe(UNIONBANK_SAMPLE);
  });

  test("keeps current (empty) text when the OCR candidate is also unusable", () => {
    const result = pickBetterSoaText("", GARBLED_SAMPLE);
    expect(result.usedCandidate).toBe(false);
    expect(result.text).toBe("");
  });

  test("prefers a partially-better candidate over a strictly worse current text", () => {
    const currentBad = "no money or date here at all, just words";
    const candidateBetter = `${currentBad} but this one has 1,234.56 in it`;
    const result = pickBetterSoaText(currentBad, candidateBetter);
    expect(result.usedCandidate).toBe(true);
  });
});
