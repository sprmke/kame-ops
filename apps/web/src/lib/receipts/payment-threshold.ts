/** When true, receipt mark-paid requires amount >= total due (not minimum). */
export function receiptRequiresTotalDue(): boolean {
  return /^(1|true|yes)$/i.test(
    (process.env.RECEIPT_REQUIRE_TOTAL_DUE ?? "").trim(),
  );
}

/** Convert a money-like string into a JS number. Returns NaN when invalid. */
export function parseMoneyToNumber(raw: string): number {
  if (!raw) return NaN;
  const cleaned = raw
    .replace(/[^\d.,-]/g, "")
    .replace(/,/g, "")
    .trim();
  if (!cleaned) return NaN;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : NaN;
}
