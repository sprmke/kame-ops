import { describe, expect, test } from "bun:test";

import { findMissingCards } from "./soa-coverage";
import type { CardCredential, SoaRow } from "./types";

function card(overrides: Partial<CardCredential>): CardCredential {
  return {
    issuer: "metrobank",
    last4: "1111",
    password: "secret",
    ...overrides,
  };
}

function row(overrides: Partial<SoaRow>): SoaRow {
  return {
    bankLabel: "Metrobank",
    issuerId: "metrobank",
    cardLast4: "1111",
    sourceEmailSubject: "subject",
    sourceMessageId: "msg-1",
    pdfFileName: "file.pdf",
    minimumDue: "1,000.00",
    totalDue: "10,000.00",
    statementDate: "Jun 01, 2026",
    dueDate: "Jun 22, 2026",
    ...overrides,
  };
}

describe("findMissingCards", () => {
  test("flags a card whose issuer had PDFs but no row matched its last-4", () => {
    // Two Metrobank cards; only one got a parsed row even though PDFs were found.
    const cards = [card({ last4: "1111" }), card({ last4: "2222" })];
    const rows = [row({ cardLast4: "1111" })];
    const banksWithPdf = new Set(["metrobank"]);

    const missing = findMissingCards(cards, rows, banksWithPdf);

    expect(missing).toHaveLength(1);
    expect(missing[0]?.last4).toBe("2222");
  });

  test("does not flag a card when its issuer had no PDFs at all (bank-level placeholder handles it)", () => {
    const cards = [card({ issuer: "bpi", last4: "3333" })];
    const rows: SoaRow[] = [];
    const banksWithPdf = new Set<string>(); // bpi had zero PDFs

    const missing = findMissingCards(cards, rows, banksWithPdf);

    expect(missing).toHaveLength(0);
  });

  test("does not flag a card that has a matching row", () => {
    const cards = [card({ last4: "1111" })];
    const rows = [row({ cardLast4: "1111" })];
    const banksWithPdf = new Set(["metrobank"]);

    const missing = findMissingCards(cards, rows, banksWithPdf);

    expect(missing).toHaveLength(0);
  });

  test("ignores existing unavailable placeholder rows when checking coverage", () => {
    const cards = [card({ last4: "1111" })];
    const rows = [row({ cardLast4: "1111", soaUnavailable: true })];
    const banksWithPdf = new Set(["metrobank"]);

    const missing = findMissingCards(cards, rows, banksWithPdf);

    expect(missing).toHaveLength(1);
  });

  test("normalizes last-4 formatting when comparing", () => {
    const cards = [card({ last4: "0007" })];
    const rows = [row({ cardLast4: "7" })];
    const banksWithPdf = new Set(["metrobank"]);

    const missing = findMissingCards(cards, rows, banksWithPdf);

    expect(missing).toHaveLength(0);
  });
});
