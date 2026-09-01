import { describe, expect, test } from "bun:test";

import type { CardCredential, SoaRow } from "./types";
import {
  identityIsAssignedToKnownCard,
  last4MatchesKnownCard,
  mergeAiIntoSoaRow,
  resolveIssuerAndLast4,
} from "./manual-upload-identity";

const cards: CardCredential[] = [
  { issuer: "rcbc", last4: "8899", password: "a" },
  { issuer: "bpi", last4: "1122", password: "b" },
];

function row(partial: Partial<SoaRow>): SoaRow {
  return {
    bankLabel: "BPI",
    issuerId: "bpi",
    cardLast4: "1122",
    sourceEmailSubject: "Manual upload",
    sourceMessageId: "manual:1",
    pdfFileName: "soa.pdf",
    minimumDue: "100.00",
    totalDue: "200.00",
    statementDate: "Mar 12, 2026",
    dueDate: "Apr 08, 2026",
    transactions: [{ date: "Mar 01", description: "Store", amount: "10.00" }],
    ...partial,
  };
}

describe("last4MatchesKnownCard", () => {
  test("rejects last-4 that is not on a user card", () => {
    expect(last4MatchesKnownCard("0001", cards)).toBe(false);
    expect(last4MatchesKnownCard("12", cards)).toBe(false);
  });

  test("accepts a real card last-4", () => {
    expect(last4MatchesKnownCard("8899", cards)).toBe(true);
    expect(last4MatchesKnownCard("xx8899", cards)).toBe(true);
  });
});

describe("mergeAiIntoSoaRow", () => {
  test("does not overwrite a parsed issuer or last-4", () => {
    const merged = mergeAiIntoSoaRow(
      row({ issuerId: "bpi", cardLast4: "1122" }),
      {
        issuerId: "rcbc",
        cardLast4: "8899",
        statementDate: null,
        dueDate: null,
        minimumDue: null,
        totalDue: null,
        transactions: [],
      },
    );
    expect(merged.issuerId).toBe("bpi");
    expect(merged.cardLast4).toBe("1122");
  });

  test("fills blank totals and dates", () => {
    const merged = mergeAiIntoSoaRow(
      row({ minimumDue: "—", statementDate: "—" }),
      {
        issuerId: "bpi",
        cardLast4: null,
        statementDate: "2026-03-12",
        dueDate: null,
        minimumDue: "50.00",
        totalDue: null,
        transactions: [],
      },
    );
    expect(merged.minimumDue).toBe("50.00");
    expect(merged.statementDate).toBe("2026-03-12");
  });
});

describe("resolveIssuerAndLast4", () => {
  test("does not fall back to an arbitrary last-4", () => {
    const result = resolveIssuerAndLast4({
      text: "Some random PDF",
      cards,
      unlockLast4: "0000",
      ai: {
        issuerId: "rcbc",
        cardLast4: "0001",
        statementDate: null,
        dueDate: null,
        minimumDue: null,
        totalDue: null,
        transactions: [],
      },
    });
    expect(result.last4).toBe("");
    expect(
      identityIsAssignedToKnownCard(result.issuerId, result.last4, cards),
    ).toBe(false);
  });

  test("uses unique last-4 from statement text", () => {
    const result = resolveIssuerAndLast4({
      text: "Card ending 8899 RCBC Flex Visa",
      cards,
      unlockLast4: "0000",
      ai: null,
    });
    expect(result).toEqual({ issuerId: "rcbc", last4: "8899" });
  });

  test("disambiguates shared last-4 with issuer text", () => {
    const shared: CardCredential[] = [
      { issuer: "rcbc", last4: "1111", password: "a" },
      { issuer: "bpi", last4: "1111", password: "b" },
    ];
    const result = resolveIssuerAndLast4({
      text: "Bank of the Philippine Islands ending 1111",
      cards: shared,
      unlockLast4: "0000",
      ai: null,
    });
    expect(result).toEqual({ issuerId: "bpi", last4: "1111" });
  });

  test("does not assign the only card of an issuer without last-4", () => {
    const result = resolveIssuerAndLast4({
      text: "RCBC Flex Visa",
      cards,
      unlockLast4: "0000",
      ai: null,
    });
    expect(result.last4).toBe("");
  });
});
