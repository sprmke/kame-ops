import { describe, expect, test } from "bun:test";

import {
  dueStatementAmountKey,
  indexStatementsByDueAmount,
  matchStatementToDueEntry,
} from "./due-statement-match";

describe("dueStatementAmountKey", () => {
  test("builds stable issuer + due + amount key", () => {
    expect(dueStatementAmountKey("unionbank", "2026-06-22", "42,392.77")).toBe(
      "unionbank:2026-06-22:42392.77",
    );
  });
});

describe("matchStatementToDueEntry", () => {
  test("matches by issuer, due date, and total due", () => {
    const statements = indexStatementsByDueAmount([
      {
        issuerId: "unionbank",
        cardLast4: "6607",
        dueDateYmd: "2026-06-22",
        totalDue: "42,392.77",
      },
      {
        issuerId: "unionbank",
        cardLast4: "0344",
        dueDateYmd: "2026-06-29",
        totalDue: "31,785.87",
      },
    ]);

    const matched = matchStatementToDueEntry(
      {
        issuerId: "unionbank",
        dueDateYmd: "2026-06-22",
        totalDue: "42,392.77",
        cardLast4: "0344",
      },
      statements,
    );

    expect(matched?.cardLast4).toBe("6607");
  });
});
