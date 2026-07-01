type TransactionLine = { date: string; description: string; amount: string };

function parseTransactionAmount(raw: string): number {
  const cleaned = raw.replace(/[^\d.,-]/g, "").replace(/,/g, "");
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : 0;
}

export function formatInterestCharges(
  transactions: TransactionLine[] | undefined,
): string | undefined {
  if (!transactions || transactions.length === 0) return undefined;
  const lines = transactions.filter((t) =>
    /interest\s+charges?/i.test(t.description),
  );
  if (lines.length === 0) return undefined;
  const total = lines.reduce(
    (sum, t) => sum + parseTransactionAmount(t.amount),
    0,
  );
  return `₱${total.toLocaleString("en-PH", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}
