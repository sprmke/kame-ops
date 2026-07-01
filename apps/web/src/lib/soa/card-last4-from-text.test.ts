import { describe, expect, test } from "bun:test";

import {
  extractCardLast4Candidates,
  resolveCardLast4FromSoaText,
} from "./card-last4-from-text";

describe("extractCardLast4Candidates", () => {
  test("finds full PAN groups", () => {
    const text =
      "Unionbank Miles+ 4741 3700 2517 0344 Statement Date: Jun 11, 2026";
    expect(extractCardLast4Candidates(text)).toContain("0344");
  });

  test("finds masked PAN", () => {
    const text = "Card number XXXX XXXX XXXX 5678";
    expect(extractCardLast4Candidates(text)).toContain("5678");
  });
});

describe("resolveCardLast4FromSoaText", () => {
  const unionbankCards = [
    {
      last4: "6607",
      label: "Unionbank Rewards Platinum",
      fullPan: "4157 6400 6049 6607",
    },
    {
      last4: "0344",
      label: "Unionbank Miles+",
      fullPan: "4741 3700 2517 0344",
    },
  ];

  test("uses PAN from text when unlock last4 differs", () => {
    const text =
      "Unionbank Cashback 5123 4500 8899 7788 Total Amount Due PHP 1,234.56";
    const resolved = resolveCardLast4FromSoaText(
      text,
      [
        { last4: "0344", fullPan: "4741 3700 2517 0344" },
        { last4: "7788", fullPan: "5123 4500 8899 7788" },
      ],
      "0344",
    );
    expect(resolved).toBe("7788");
  });

  test("prefers configured fullPan over unlock last4", () => {
    const text =
      "Card No. 4157 6400 6049 6607 Statement Date: Jun 05, 2026 Total Amount Due PHP 42,392.77";
    expect(resolveCardLast4FromSoaText(text, unionbankCards, "0344")).toBe(
      "6607",
    );
  });

  test("uses email subject when PDF text has no card number", () => {
    const text = "Statement Date: Jun 11, 2026 Total Amount Due PHP 31,785.87";
    expect(
      resolveCardLast4FromSoaText(
        text,
        unionbankCards,
        "6607",
        "UnionBank Miles+ Platinum Credit Card e-Statement",
      ),
    ).toBe("0344");
  });

  test("prefers rewards label when subject names rewards platinum", () => {
    const text = "Statement Date: Jun 05, 2026 Total Amount Due PHP 42,392.77";
    expect(
      resolveCardLast4FromSoaText(
        text,
        unionbankCards,
        "0344",
        "UnionBank Rewards Platinum Credit Card e-Statement",
      ),
    ).toBe("6607");
  });

  test("parses ending-in pattern from Unionbank Gmail subjects", () => {
    const text = "Statement Date: Jun 05, 2026 Total Amount Due PHP 42,392.77";
    expect(
      resolveCardLast4FromSoaText(
        text,
        unionbankCards,
        "0344",
        "Your REWARDS VISA PLATINUM Credit Card ending in 6607 e-Statement",
      ),
    ).toBe("6607");
    expect(
      resolveCardLast4FromSoaText(
        text,
        unionbankCards,
        "6607",
        "Your MILES+ VISA SIGNATURE Credit Card ending in 0344 e-Statement",
      ),
    ).toBe("0344");
  });

  test("keeps unlock last4 when text has no matching known card", () => {
    const text = "Statement Date: Jun 11, 2026 Total Amount Due PHP 100.00";
    const resolved = resolveCardLast4FromSoaText(
      text,
      [{ last4: "0344" }, { last4: "7788" }],
      "0344",
    );
    expect(resolved).toBe("0344");
  });

  test("picks earliest known last4 when multiple appear", () => {
    const text =
      "Primary 4741 3700 2517 0344 Supplementary 5123 4500 8899 7788";
    const resolved = resolveCardLast4FromSoaText(
      text,
      [{ last4: "0344" }, { last4: "7788" }],
      "0344",
    );
    expect(resolved).toBe("0344");
  });
});
