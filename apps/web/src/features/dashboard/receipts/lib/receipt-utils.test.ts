import { describe, expect, it } from "bun:test";

import {
  dedupeReceiptsForDisplay,
  type ReceiptListItem,
  type ReceiptMonthDueContext,
} from "./receipt-utils";

const dues: ReceiptMonthDueContext[] = [
  {
    id: "due-6607",
    issuerId: "unionbank",
    cardLast4: "6607",
    dueDateYmd: "2026-06-22",
    statementPeriodKey: "2026-06",
    statementPeriodLabel: "June 2026",
  },
];

function receipt(
  overrides: Partial<ReceiptListItem> & Pick<ReceiptListItem, "id">,
): ReceiptListItem {
  return {
    originalFileName: "payment.jpg",
    parsedCardLast4: "6607",
    parsedAmount: 42393,
    parsedAmountRaw: "42,393.00",
    bankDetected: "Unionbank",
    aiVerdict: "valid",
    aiSummary: null,
    aiAnalysis: null,
    paymentStatus: "pending",
    createdAt: new Date("2026-06-20T10:00:00Z"),
    dueEntryId: null,
    cardDisplayLabel: "Unionbank Rewards Platinum",
    bankLabel: "Unionbank",
    dueDateYmd: "2026-06-22",
    statementDate: null,
    statementPeriodKey: "2026-06",
    statementPeriodLabel: "June 2026",
    minimumDue: "1,188.53",
    totalDue: "42,392.77",
    ...overrides,
  };
}

describe("dedupeReceiptsForDisplay", () => {
  it("collapses same card, period, and filename — preferring marked paid", () => {
    const result = dedupeReceiptsForDisplay(
      [
        receipt({
          id: "rejected-retry",
          paymentStatus: "rejected",
          createdAt: new Date("2026-06-21T12:00:00Z"),
        }),
        receipt({
          id: "paid-original",
          paymentStatus: "marked_paid",
          createdAt: new Date("2026-06-20T10:00:00Z"),
        }),
      ],
      dues,
    );

    expect(result).toHaveLength(1);
    expect(result[0]?.id).toBe("paid-original");
  });

  it("keeps the newest receipt when payment status rank is equal", () => {
    const result = dedupeReceiptsForDisplay(
      [
        receipt({
          id: "older-pending",
          paymentStatus: "pending",
          createdAt: new Date("2026-06-20T10:00:00Z"),
        }),
        receipt({
          id: "newer-pending",
          paymentStatus: "pending",
          createdAt: new Date("2026-06-21T12:00:00Z"),
        }),
      ],
      dues,
    );

    expect(result).toHaveLength(1);
    expect(result[0]?.id).toBe("newer-pending");
  });

  it("keeps different filenames for the same card and period", () => {
    const result = dedupeReceiptsForDisplay(
      [
        receipt({
          id: "first-payment",
          originalFileName: "payment-part-1.jpg",
        }),
        receipt({
          id: "second-payment",
          originalFileName: "payment-part-2.jpg",
          parsedAmount: 15000,
          parsedAmountRaw: "15,000.00",
        }),
      ],
      dues,
    );

    expect(result).toHaveLength(2);
    expect(result.map((row) => row.id).sort()).toEqual([
      "first-payment",
      "second-payment",
    ]);
  });

  it("keeps the same filename across different cards", () => {
    const result = dedupeReceiptsForDisplay(
      [
        receipt({ id: "card-6607", parsedCardLast4: "6607" }),
        receipt({
          id: "card-0344",
          parsedCardLast4: "0344",
          cardDisplayLabel: "Unionbank Miles+",
        }),
      ],
      dues,
    );

    expect(result).toHaveLength(2);
  });
});
