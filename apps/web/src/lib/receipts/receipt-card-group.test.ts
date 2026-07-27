import { describe, expect, test } from "bun:test";

import { groupAnalyzedBatchItems } from "./receipt-card-group";
import type { CreditCardReceiptAiResult } from "@/lib/receipts/types";

function mockAi(
  last4?: string,
  bank?: string,
): CreditCardReceiptAiResult {
  return {
    verdict: "valid",
    confidence: 0.9,
    summary: "mock",
    hasAmount: true,
    hasDate: true,
    hasReference: true,
    isCreditCardPayment: true,
    extraction: {
      cardLast4: last4,
      amount: 50_000,
      bankOrWallet: bank,
    },
    provider: "gemini",
  };
}

describe("receipt-card-group", () => {
  test("groups receipts for the same card together", () => {
    const groups = groupAnalyzedBatchItems(
      [
        {
          storagePath: "a",
          ai: mockAi("1234", "BPI"),
        },
        {
          storagePath: "b",
          ai: mockAi("1234", "BPI"),
        },
      ],
      [{ last4: "1234", issuerId: "bpi", bankLabel: "BPI", displayLabel: "BPI Gold" }],
    );

    expect(groups).toHaveLength(1);
    expect(groups[0]?.items).toHaveLength(2);
    expect(groups[0]?.label).toBe("BPI Gold");
  });

  test("splits receipts for different cards into separate groups", () => {
    const groups = groupAnalyzedBatchItems(
      [
        { storagePath: "a", ai: mockAi("1234", "BPI") },
        { storagePath: "b", ai: mockAi("5678", "Metrobank") },
      ],
      [
        { last4: "1234", issuerId: "bpi", bankLabel: "BPI" },
        { last4: "5678", issuerId: "metrobank", bankLabel: "Metrobank" },
      ],
    );

    expect(groups).toHaveLength(2);
  });

  test("forces a single group when due entry is provided", () => {
    const groups = groupAnalyzedBatchItems(
      [
        { storagePath: "a", ai: mockAi("1234") },
        { storagePath: "b", ai: mockAi("5678") },
      ],
      [],
      {
        forcedDueEntryId: "due-1",
        forcedLabel: "RCBC ·••• 9999",
      },
    );

    expect(groups).toHaveLength(1);
    expect(groups[0]?.label).toBe("RCBC ·••• 9999");
    expect(groups[0]?.items).toHaveLength(2);
  });
});
