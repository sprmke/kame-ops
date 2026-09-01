import { afterEach, describe, expect, test } from "bun:test";

import {
  disabledOcrIssuers,
  envCsvSet,
  envFlag,
  forcedOcrIssuers,
  ocrDisabledForIssuer,
  ocrForcedForIssuer,
  ocrTuningForIssuer,
} from "./ocr-env";

const OCR_ENV_KEYS = [
  "SOA_OCR_FORCE",
  "SOA_OCR_DISABLE",
  "SOA_OCR_PAGES",
  "SOA_OCR_SCALE",
  "SOA_OCR_PSM",
  "SOA_OCR_DUAL",
  "SOA_OCR_DEBUG",
  "BPI_OCR",
  "BPI_OCR_PAGES",
  "BPI_OCR_SCALE",
  "BPI_OCR_PSM",
  "BPI_OCR_DUAL",
  "BPI_OCR_DEBUG",
];

function clearOcrEnv(): void {
  for (const key of OCR_ENV_KEYS) delete process.env[key];
}

afterEach(() => {
  clearOcrEnv();
});

describe("envFlag", () => {
  test("treats 1/true/yes (any case) as truthy", () => {
    for (const v of ["1", "true", "TRUE", "yes", "YES"]) {
      process.env.SOA_OCR_DEBUG = v;
      expect(envFlag("SOA_OCR_DEBUG")).toBe(true);
    }
  });

  test("treats unset, empty, or other values as falsy", () => {
    delete process.env.SOA_OCR_DEBUG;
    expect(envFlag("SOA_OCR_DEBUG")).toBe(false);
    process.env.SOA_OCR_DEBUG = "0";
    expect(envFlag("SOA_OCR_DEBUG")).toBe(false);
    process.env.SOA_OCR_DEBUG = "nope";
    expect(envFlag("SOA_OCR_DEBUG")).toBe(false);
  });
});

describe("envCsvSet", () => {
  test("splits, trims, and lowercases a comma-separated list", () => {
    process.env.SOA_OCR_FORCE = " BPI, RCBC ,unionbank";
    expect(envCsvSet("SOA_OCR_FORCE")).toEqual(
      new Set(["bpi", "rcbc", "unionbank"]),
    );
  });

  test("returns an empty set when unset", () => {
    delete process.env.SOA_OCR_FORCE;
    expect(envCsvSet("SOA_OCR_FORCE")).toEqual(new Set());
  });
});

describe("ocrForcedForIssuer", () => {
  test("is false by default for any issuer", () => {
    expect(ocrForcedForIssuer("bpi")).toBe(false);
    expect(ocrForcedForIssuer("rcbc")).toBe(false);
  });

  test("SOA_OCR_FORCE=all forces every issuer", () => {
    process.env.SOA_OCR_FORCE = "all";
    expect(ocrForcedForIssuer("metrobank")).toBe(true);
    expect(ocrForcedForIssuer("unionbank")).toBe(true);
  });

  test("SOA_OCR_FORCE with a specific issuer list only forces those (case-insensitive)", () => {
    process.env.SOA_OCR_FORCE = "RCBC";
    expect(ocrForcedForIssuer("rcbc")).toBe(true);
    expect(ocrForcedForIssuer("bpi")).toBe(false);
  });

  test("legacy BPI_OCR=1 forces BPI only, not other issuers", () => {
    process.env.BPI_OCR = "1";
    expect(ocrForcedForIssuer("bpi")).toBe(true);
    expect(ocrForcedForIssuer("rcbc")).toBe(false);
  });
});

describe("ocrDisabledForIssuer", () => {
  test("is false by default", () => {
    expect(ocrDisabledForIssuer("bpi")).toBe(false);
  });

  test("SOA_OCR_DISABLE=all disables every issuer", () => {
    process.env.SOA_OCR_DISABLE = "all";
    expect(ocrDisabledForIssuer("metrobank")).toBe(true);
  });

  test("SOA_OCR_DISABLE with a specific issuer only disables that one", () => {
    process.env.SOA_OCR_DISABLE = "unionbank";
    expect(ocrDisabledForIssuer("unionbank")).toBe(true);
    expect(ocrDisabledForIssuer("bpi")).toBe(false);
  });
});

describe("ocrTuningForIssuer", () => {
  test("returns sane defaults when nothing is set", () => {
    const tuning = ocrTuningForIssuer("bpi");
    expect(tuning.maxPages).toBe(0);
    expect(tuning.scale).toBe(3);
    expect(tuning.dualSparse).toBe(false);
    expect(tuning.debug).toBe(false);
    expect(tuning.psmRaw).toBeUndefined();
  });

  test("reads generic SOA_OCR_* vars for any issuer", () => {
    process.env.SOA_OCR_PAGES = "2";
    process.env.SOA_OCR_SCALE = "4";
    process.env.SOA_OCR_DUAL = "1";
    process.env.SOA_OCR_DEBUG = "1";
    process.env.SOA_OCR_PSM = "6";
    const tuning = ocrTuningForIssuer("rcbc");
    expect(tuning.maxPages).toBe(2);
    expect(tuning.scale).toBe(4);
    expect(tuning.dualSparse).toBe(true);
    expect(tuning.debug).toBe(true);
    expect(tuning.psmRaw).toBe("6");
  });

  test("clamps scale and page count to sane bounds", () => {
    process.env.SOA_OCR_SCALE = "10";
    process.env.SOA_OCR_PAGES = "999";
    const tuning = ocrTuningForIssuer("metrobank");
    expect(tuning.scale).toBe(4);
    expect(tuning.maxPages).toBe(50);
  });

  test("falls back to legacy BPI_OCR_* only for the bpi issuer", () => {
    process.env.BPI_OCR_PAGES = "5";
    process.env.BPI_OCR_SCALE = "2";
    process.env.BPI_OCR_DUAL = "1";
    const bpiTuning = ocrTuningForIssuer("bpi");
    expect(bpiTuning.maxPages).toBe(5);
    expect(bpiTuning.scale).toBe(2);
    expect(bpiTuning.dualSparse).toBe(true);

    const rcbcTuning = ocrTuningForIssuer("rcbc");
    expect(rcbcTuning.maxPages).toBe(0);
    expect(rcbcTuning.scale).toBe(3);
    expect(rcbcTuning.dualSparse).toBe(false);
  });

  test("generic SOA_OCR_* takes precedence over legacy BPI_OCR_* for bpi", () => {
    process.env.BPI_OCR_SCALE = "2";
    process.env.SOA_OCR_SCALE = "3.5";
    expect(ocrTuningForIssuer("bpi").scale).toBe(3.5);
  });
});

describe("forcedOcrIssuers", () => {
  const known = ["metrobank", "rcbc", "bpi", "unionbank"];

  test("returns an empty list by default", () => {
    expect(forcedOcrIssuers(known)).toEqual([]);
  });

  test("returns every known issuer when SOA_OCR_FORCE=all", () => {
    process.env.SOA_OCR_FORCE = "all";
    expect(forcedOcrIssuers(known)).toEqual(known);
  });

  test("includes bpi via legacy BPI_OCR and named issuers via SOA_OCR_FORCE", () => {
    process.env.BPI_OCR = "1";
    process.env.SOA_OCR_FORCE = "rcbc";
    const forced = forcedOcrIssuers(known);
    expect(forced).toContain("bpi");
    expect(forced).toContain("rcbc");
    expect(forced).not.toContain("metrobank");
  });
});

describe("disabledOcrIssuers", () => {
  const known = ["metrobank", "rcbc", "bpi", "unionbank"];

  test("returns an empty list by default", () => {
    expect(disabledOcrIssuers(known)).toEqual([]);
  });

  test("returns every known issuer when SOA_OCR_DISABLE=all", () => {
    process.env.SOA_OCR_DISABLE = "all";
    expect(disabledOcrIssuers(known)).toEqual(known);
  });

  test("returns only the named issuers otherwise", () => {
    process.env.SOA_OCR_DISABLE = "unionbank,bpi";
    expect(disabledOcrIssuers(known).sort()).toEqual(["bpi", "unionbank"]);
  });
});
