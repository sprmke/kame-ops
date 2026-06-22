import { parseTransactionAmount } from "@/features/dashboard/soa/lib/transaction-utils";
import {
  CANNOT_ANALYZE_SLUG,
  categoryLabel,
  type TransactionCategorySlug,
} from "@/lib/transactions/categories";

export type CategorizedTx = {
  id: string;
  description: string;
  amount: string;
  categorySlug?: string | null;
  categoryLabel?: string | null;
};

export type CategorySpendRow = {
  slug: TransactionCategorySlug;
  label: string;
  total: number;
  count: number;
};

export function aggregateCategorySpend(
  transactions: CategorizedTx[],
): CategorySpendRow[] {
  const map = new Map<TransactionCategorySlug, CategorySpendRow>();

  for (const tx of transactions) {
    const slug = (tx.categorySlug ??
      CANNOT_ANALYZE_SLUG) as TransactionCategorySlug;
    if (slug === "payment_credit" || slug === "interest_fees") continue;

    const amount = parseTransactionAmount(tx.amount);
    if (amount <= 0) continue;

    const existing = map.get(slug) ?? {
      slug,
      label: tx.categoryLabel ?? categoryLabel(slug),
      total: 0,
      count: 0,
    };
    existing.total += amount;
    existing.count += 1;
    map.set(slug, existing);
  }

  return [...map.values()].sort((a, b) => b.total - a.total);
}

export function countUnanalyzed(transactions: CategorizedTx[]): number {
  return transactions.filter(
    (t) => (t.categorySlug ?? CANNOT_ANALYZE_SLUG) === CANNOT_ANALYZE_SLUG,
  ).length;
}
