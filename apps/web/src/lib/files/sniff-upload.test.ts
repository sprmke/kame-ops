import { describe, expect, test } from "bun:test";

import { resolveAllowedUploadMime, sniffUploadMime } from "./sniff-upload";

describe("sniffUploadMime", () => {
  test("detects PDF and JPEG magic bytes", () => {
    expect(
      sniffUploadMime(new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d])),
    ).toBe("application/pdf");
    expect(sniffUploadMime(new Uint8Array([0xff, 0xd8, 0xff, 0xe0]))).toBe(
      "image/jpeg",
    );
  });

  test("rejects empty and unknown bytes", () => {
    expect(sniffUploadMime(new Uint8Array([]))).toBeNull();
    expect(sniffUploadMime(new Uint8Array([0x00, 0x01, 0x02]))).toBeNull();
  });
});

describe("resolveAllowedUploadMime", () => {
  test("does not trust empty declared type without magic bytes", () => {
    expect(
      resolveAllowedUploadMime(new Uint8Array([0x00]), "soa.pdf", ""),
    ).toBeNull();
  });

  test("allows declared type only when it matches the extension", () => {
    expect(
      resolveAllowedUploadMime(
        new Uint8Array([0x00]),
        "photo.png",
        "image/png",
      ),
    ).toBe("image/png");
    expect(
      resolveAllowedUploadMime(
        new Uint8Array([0x00]),
        "photo.png",
        "application/pdf",
      ),
    ).toBeNull();
  });

  test("prefers sniffed type over a lying Content-Type", () => {
    expect(
      resolveAllowedUploadMime(
        new Uint8Array([0x25, 0x50, 0x44, 0x46]),
        "photo.png",
        "image/png",
      ),
    ).toBe("application/pdf");
  });
});
