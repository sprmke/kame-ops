import { describe, expect, test } from "bun:test";

import { extractTransactions } from "./parse-transactions";

const METROBANK_TABLE = `
Post Date Tran Date Description Amount
03/01 03/02 SHOPEE PH ONLINE 1,234.56
03/05 03/06 GRAB TRANSPORT 250.00
Total Amount Due PHP 12,345.67
`;

const RCBC_TABLE = `
Sale Date Post Date Description Amount
01/02/26 01/03/26 SPOTIFY PHILIPPINES 169.00
01/04/26 01/05/26 SM SUPERMARKET 2,500.00-
Balance End 5,000.00
`;

const UNIONBANK_TABLE = `
Transaction Date Post Date Description Amount
Previous Balance P 0.00
01/05/26 01/06/26 NETFLIX.COM PHP 549.00
********** END OF STATEMENT **********
`;

const BPI_TABLE = `
Transaction Date Post Date Description Amount
January 25 January 26 Payment - Thank You -33,919.02
February 02 February 03 SM STORE 1,299.00
Installment Balance Summary
`;

/** Simulates a broken/subset-font PDF extract (private-use glyphs + repeated punctuation, no real data). */
const GARBLED = "\uE001\uE002".repeat(40) + "()()()()()()";

describe("extractTransactions", () => {
  test("extracts Metrobank rows from a real-looking table", () => {
    const rows = extractTransactions("metrobank", METROBANK_TABLE);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({
      date: "03/01 / 03/02",
      description: "SHOPEE PH ONLINE",
      amount: "1,234.56",
    });
  });

  test("extracts RCBC rows and marks trailing-dash amounts as credits", () => {
    const rows = extractTransactions("rcbc", RCBC_TABLE);
    expect(rows).toHaveLength(2);
    expect(rows[1]).toMatchObject({
      description: "SM SUPERMARKET",
      amount: "2,500.00 (CR)",
    });
  });

  test("extracts Unionbank rows and skips the previous-balance summary line", () => {
    const rows = extractTransactions("unionbank", UNIONBANK_TABLE);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      description: "NETFLIX.COM",
      amount: "549.00",
    });
  });

  test("extracts BPI rows (month-name dates) and stops before the installment summary", () => {
    const rows = extractTransactions("bpi", BPI_TABLE);
    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({
      description: "Payment - Thank You",
      amount: "33,919.02 (CR)",
    });
  });

  test("returns no rows for any issuer when the source text is garbled/unusable", () => {
    for (const issuer of [
      "metrobank",
      "rcbc",
      "unionbank",
      "bpi",
      "some-new-bank",
    ]) {
      expect(extractTransactions(issuer, GARBLED)).toEqual([]);
    }
  });

  test("returns no rows for empty text without throwing", () => {
    expect(extractTransactions("metrobank", "")).toEqual([]);
  });
});
