import { describe, expect, it } from "vitest";

import {
  inputHasOnlyMaskedKeys,
  isMaskedKeySegment,
  resolveKeysFromInput,
} from "./keys-input";

describe("isMaskedKeySegment", () => {
  it("accepts suffix with underscore", () => {
    expect(isMaskedKeySegment("••••_8MA")).toBe(true);
  });

  it("accepts suffix with hyphen", () => {
    expect(isMaskedKeySegment("••••-abc")).toBe(true);
  });

  it("rejects full API keys", () => {
    expect(isMaskedKeySegment("AIzaSyD-example-key")).toBe(false);
  });
});

describe("resolveKeysFromInput", () => {
  it("keeps existing keys when input is masked previews", () => {
    const existing = ["key-one-full", "key-two-full"];
    expect(resolveKeysFromInput("••••_8MA, ••••JzRw", existing)).toEqual(
      existing,
    );
  });
});

describe("inputHasOnlyMaskedKeys", () => {
  it("detects preview-only input", () => {
    expect(inputHasOnlyMaskedKeys("••••_8MA, ••••JzRw")).toBe(true);
    expect(inputHasOnlyMaskedKeys("••••_8MA, AIzaSyRealKey1234567890")).toBe(
      false,
    );
  });
});
