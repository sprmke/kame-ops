import { describe, expect, test } from "bun:test";

import { formatDueCardTitle } from "./reminder-utils";

describe("formatDueCardTitle", () => {
  test("uses card display label and last4 when identity is correct", () => {
    expect(
      formatDueCardTitle({
        id: "1",
        issuerId: "unionbank",
        bankLabel: "Unionbank",
        cardLast4: "6607",
        cardDisplayLabel: "Unionbank Rewards Platinum",
        dueDate: "Jun 22, 2026",
        dueDateYmd: "2026-06-22",
        statementPeriodKey: "2026-06",
        statementPeriodLabel: "June 2026",
        minimumDue: "1,188.53",
        totalDue: "42,392.77",
        paidAt: null,
      }),
    ).toBe("Unionbank Rewards Platinum - 6607 - June");
  });
});
