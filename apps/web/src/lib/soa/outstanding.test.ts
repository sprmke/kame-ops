import { describe, expect, test } from "bun:test";

import { computeOutstandingTotals } from "./outstanding";

describe("computeOutstandingTotals", () => {
  test("counts distinct cards in a period, not duplicate statement rows", () => {
    const totals = computeOutstandingTotals(
      [
        {
          issuerId: "unionbank",
          cardLast4: "6607",
          creditCardId: "card-rewards",
          statementMonth: 6,
          statementYear: 2026,
          statementDate: "Jun 05, 2026",
          totalDue: "42392.77",
          minimumDue: "1188.53",
          dueDateYmd: "2026-06-22",
          cardDisplayLabel: "Unionbank Rewards",
        },
        {
          issuerId: "unionbank",
          cardLast4: "0344",
          creditCardId: "card-miles",
          statementMonth: 6,
          statementYear: 2026,
          statementDate: "Jun 11, 2026",
          totalDue: "31785.87",
          minimumDue: "895.78",
          dueDateYmd: "2026-06-29",
          cardDisplayLabel: "Unionbank Miles+",
        },
      ],
      [],
    );

    expect(totals.cardCount).toBe(2);
    expect(totals.grossStatementDue).toBeCloseTo(42392.77 + 31785.87, 2);
    expect(totals.nextDueYmd).toBe("2026-06-22");
    expect(totals.cards.map((card) => card.cardLast4).sort()).toEqual([
      "0344",
      "6607",
    ]);
  });

  test("uses the latest statement date when the same card has two rows", () => {
    const totals = computeOutstandingTotals(
      [
        {
          issuerId: "unionbank",
          cardLast4: "0344",
          statementMonth: 6,
          statementYear: 2026,
          statementDate: "Jun 05, 2026",
          totalDue: "42392.77",
          minimumDue: "1188.53",
          dueDateYmd: "2026-06-22",
        },
        {
          issuerId: "unionbank",
          cardLast4: "0344",
          statementMonth: 6,
          statementYear: 2026,
          statementDate: "Jun 11, 2026",
          totalDue: "31785.87",
          minimumDue: "895.78",
          dueDateYmd: "2026-06-29",
        },
      ],
      [],
    );

    expect(totals.cardCount).toBe(1);
    expect(totals.grossStatementDue).toBeCloseTo(31785.87, 2);
    expect(totals.totalDue).toBeCloseTo(31785.87, 2);
  });
});
