import { describe, expect, it } from "bun:test";

import { matchReceiptToDue, type DueMatchCandidate } from "./match-due";

const dues: DueMatchCandidate[] = [
  {
    id: "due-may",
    issuerId: "unionbank",
    cardLast4: "2600",
    dueDateYmd: "2026-06-08",
    statementPeriodKey: "2026-05",
    statementPeriodLabel: "May 2026",
  },
  {
    id: "due-june",
    issuerId: "metrobank",
    cardLast4: "3746",
    dueDateYmd: "2026-06-25",
    statementPeriodKey: "2026-06",
    statementPeriodLabel: "June 2026",
  },
];

describe("matchReceiptToDue", () => {
  it("prefers linked dueEntryId", () => {
    const matched = matchReceiptToDue(dues, {
      dueEntryId: "due-may",
      parsedCardLast4: "3746",
      createdAt: new Date("2026-06-01"),
    });
    expect(matched?.id).toBe("due-may");
  });

  it("matches card last4 and due date exactly", () => {
    const matched = matchReceiptToDue(dues, {
      parsedCardLast4: "2600",
      dueDateYmd: "2026-06-08",
      createdAt: new Date("2026-06-01"),
    });
    expect(matched?.statementPeriodKey).toBe("2026-05");
  });

  it("matches payment month when due date is missing on receipt", () => {
    const matched = matchReceiptToDue(dues, {
      parsedCardLast4: "2600",
      aiAnalysis: { paymentDate: "2026-06-15" },
      createdAt: new Date("2026-06-15"),
    });
    expect(matched?.id).toBe("due-may");
  });
});
