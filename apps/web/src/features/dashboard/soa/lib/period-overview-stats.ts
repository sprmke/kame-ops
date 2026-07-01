import { CANNOT_ANALYZE_SLUG } from "@/lib/transactions/categories";

import {
  aggregateCategorySpend,
  countUnanalyzed,
  type CategorizedTx,
  type CategorySpendRow,
} from "./category-analytics";
import { parseTransactionAmount } from "./transaction-utils";
import type { SoaStatement } from "./soa-utils";

export function flattenStatementTransactions(
  statements: SoaStatement[],
): CategorizedTx[] {
  return statements.flatMap((statement) =>
    (statement.transactions ?? []).map((tx) => ({
      id: tx.id,
      description: tx.description,
      amount: tx.amount,
      categorySlug: tx.categorySlug,
      categoryLabel: tx.categoryLabel,
    })),
  );
}

function sumCategoryAmount(
  transactions: CategorizedTx[],
  slug: string,
): number {
  return transactions.reduce((sum, tx) => {
    if ((tx.categorySlug ?? CANNOT_ANALYZE_SLUG) !== slug) return sum;
    const amount = parseTransactionAmount(tx.amount);
    return amount > 0 ? sum + amount : sum;
  }, 0);
}

export type PeriodOverviewStats = {
  categoryRows: CategorySpendRow[];
  analyzedRows: CategorySpendRow[];
  spendTotal: number;
  unanalyzed: number;
  topCategory: CategorySpendRow | undefined;
  topCategoryShare: number | null;
  interestFeesTotal: number;
};

export function computePeriodOverviewStats(
  transactions: CategorizedTx[],
): PeriodOverviewStats {
  const categoryRows = aggregateCategorySpend(transactions);
  const unanalyzed = countUnanalyzed(transactions);
  const spendTotal = categoryRows.reduce((sum, row) => sum + row.total, 0);
  const analyzedRows = categoryRows.filter(
    (row) => row.slug !== CANNOT_ANALYZE_SLUG,
  );
  const topCategory = analyzedRows[0];
  const topCategoryShare =
    topCategory && spendTotal > 0
      ? Math.round((topCategory.total / spendTotal) * 100)
      : null;
  const interestFeesTotal = sumCategoryAmount(transactions, "interest_fees");

  return {
    categoryRows,
    analyzedRows,
    spendTotal,
    unanalyzed,
    topCategory,
    topCategoryShare,
    interestFeesTotal,
  };
}
