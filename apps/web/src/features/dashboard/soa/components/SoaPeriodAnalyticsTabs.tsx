"use client";

import { useEffect, useRef, useState } from "react";
import { AlertCircle, Lightbulb, Sparkles } from "lucide-react";

import { StatCard } from "@/components/shared/StatCard";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils/cn";
import { formatPhpAmount } from "@/lib/utils/format-money";

import { CategorySpendBreakdown } from "./CategorySpendBreakdown";
import { CategorySpendDonut, CategorySpendLegend } from "./CategorySpendDonut";
import {
  SoaPeriodSpendByCategoryCard,
  SoaPeriodSummaryCard,
} from "./SoaPeriodOverviewCards";
import { useCategorizeWithAiActions } from "./CategorizeWithAiProvider";
import {
  computePeriodOverviewStats,
  flattenStatementTransactions,
} from "../lib/period-overview-stats";
import type { SoaStatement } from "../lib/soa-utils";
import { CANNOT_ANALYZE_SLUG } from "@/lib/transactions/categories";

import { aggregateCategorySpend } from "../lib/category-analytics";

function buildAnalyticsTips(
  categoryRows: ReturnType<typeof aggregateCategorySpend>,
  unanalyzed: number,
): string[] {
  const tips: string[] = [];

  if (unanalyzed > 0) {
    tips.push(
      `Categorize ${unanalyzed} transaction${unanalyzed === 1 ? "" : "s"} marked “Cannot analyze” to improve charts.`,
    );
  }

  const top = categoryRows[0];
  if (top && top.slug === "dining") {
    tips.push("Dining is your top spend — consider a monthly food budget cap.");
  }
  if (top && top.slug === "online_shopping") {
    tips.push(
      "Online shopping leads this period — review recurring subscriptions and carts.",
    );
  }
  if (categoryRows.some((r) => r.slug === "interest_fees")) {
    tips.push(
      "Interest or fees posted — paying total due avoids finance charges.",
    );
  }

  tips.push(
    "Add keyword rules in Settings when you recategorize merchants — future SOA runs will match automatically.",
  );

  return tips;
}

type SoaPeriodOverviewTabProps = {
  statements: SoaStatement[];
  totalPaid: number;
  outstandingDue: number;
  grossStatementDue: number;
  grossMinimumDue: number;
  minimumRemaining: number;
  minimumMetCardCount: number;
  cardCount: number;
  paidCardCount: number;
  nextDueYmd: string | null;
};

export function SoaPeriodOverviewTab({
  statements,
  totalPaid,
  outstandingDue,
  grossStatementDue,
  grossMinimumDue,
  minimumRemaining,
  minimumMetCardCount,
  cardCount,
  paidCardCount,
  nextDueYmd,
}: SoaPeriodOverviewTabProps) {
  const transactions = flattenStatementTransactions(statements);
  const {
    categoryRows,
    analyzedRows,
    spendTotal,
    unanalyzed,
    topCategory,
    topCategoryShare,
    interestFeesTotal,
  } = computePeriodOverviewStats(transactions);

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard title="Spend tracked" value={formatPhpAmount(spendTotal)} />
        <StatCard title="Transactions" value={transactions.length} />
        <StatCard title="Categories" value={categoryRows.length} />
        <StatCard title="Cannot analyze" value={unanalyzed} />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <SoaPeriodSpendByCategoryCard
          rows={analyzedRows}
          spendTotal={spendTotal}
        />
        <SoaPeriodSummaryCard
          totalPaid={totalPaid}
          outstandingDue={outstandingDue}
          grossStatementDue={grossStatementDue}
          grossMinimumDue={grossMinimumDue}
          minimumRemaining={minimumRemaining}
          minimumMetCardCount={minimumMetCardCount}
          cardCount={cardCount}
          paidCardCount={paidCardCount}
          nextDueYmd={nextDueYmd}
          spendTotal={spendTotal}
          topCategory={
            topCategory
              ? { label: topCategory.label, share: topCategoryShare }
              : undefined
          }
          interestFeesTotal={interestFeesTotal}
          unanalyzedCount={unanalyzed}
        />
      </div>
    </div>
  );
}

export function SoaPeriodAnalyticsTab({
  statements,
}: {
  statements: SoaStatement[];
}) {
  const categorize = useCategorizeWithAiActions();
  const transactions = flattenStatementTransactions(statements);
  const { categoryRows, analyzedRows, spendTotal, unanalyzed } =
    computePeriodOverviewStats(transactions);
  const analyzedSpend = analyzedRows.reduce((sum, row) => sum + row.total, 0);
  const tips = buildAnalyticsTips(categoryRows, unanalyzed);

  const [animateUpdate, setAnimateUpdate] = useState(false);
  const unanalyzedAtStartRef = useRef<number | null>(null);

  useEffect(() => {
    if (categorize.isPending) {
      unanalyzedAtStartRef.current = unanalyzed;
      return undefined;
    }

    if (
      unanalyzedAtStartRef.current !== null &&
      unanalyzed < unanalyzedAtStartRef.current
    ) {
      setAnimateUpdate(true);
      unanalyzedAtStartRef.current = null;
      const timer = window.setTimeout(() => setAnimateUpdate(false), 900);
      return () => window.clearTimeout(timer);
    }

    if (!categorize.isPending) {
      unanalyzedAtStartRef.current = null;
    }

    return undefined;
  }, [categorize.isPending, unanalyzed]);

  return (
    <div className="space-y-6">
      <div className="grid gap-6 xl:grid-cols-5">
        <Card className="border-border/80 xl:col-span-3">
          <CardHeader className="flex flex-row items-start justify-between gap-3 space-y-0 pb-4">
            <CardTitle className="font-display text-base">
              Category breakdown
            </CardTitle>
            <span className="shrink-0 text-sm tabular-nums text-muted-foreground">
              {formatPhpAmount(spendTotal)}
            </span>
          </CardHeader>
          <CardContent>
            <CategorySpendBreakdown
              rows={categoryRows}
              spendTotal={spendTotal}
              isAnalyzing={categorize.isPending}
              animateUpdate={animateUpdate}
            />
          </CardContent>
        </Card>

        <Card className="border-border/80 xl:col-span-2">
          <CardHeader>
            <CardTitle className="font-display text-base">
              Distribution
            </CardTitle>
          </CardHeader>
          <CardContent
            className={cn(
              "transition-opacity duration-700 ease-out",
              animateUpdate && "opacity-90",
            )}
          >
            <CategorySpendDonut
              rows={analyzedRows}
              spendTotal={analyzedSpend || spendTotal}
            />
            <CategorySpendLegend rows={analyzedRows} />
          </CardContent>
        </Card>
      </div>

      {tips.length > 0 && (
        <Card className="border-border/80">
          <CardHeader className="pb-3">
            <CardTitle className="font-display text-base">Tips</CardTitle>
          </CardHeader>
          <CardContent className="pt-0">
            <ul className="divide-y divide-border/60">
              {tips.map((tip, index) => {
                const isAction = index === 0 && unanalyzed > 0;
                if (isAction) {
                  return (
                    <li key={tip} className="py-3 first:pt-0 last:pb-0">
                      <button
                        type="button"
                        disabled={categorize.isPending}
                        onClick={() => categorize.analyzeUnanalyzed()}
                        className={cn(
                          "flex w-full gap-3 rounded-lg border px-3 py-2.5 text-left transition-colors",
                          "border-warning/25 bg-warning/5 hover:bg-warning/10",
                          "disabled:pointer-events-none disabled:opacity-60",
                        )}
                      >
                        <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
                        <span className="flex-1 text-sm leading-relaxed text-muted-foreground">
                          {tip}
                        </span>
                        <Sparkles className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                      </button>
                    </li>
                  );
                }
                return (
                  <li
                    key={tip}
                    className="flex gap-3 py-3 first:pt-0 last:pb-0"
                  >
                    <Lightbulb className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                    <p className="text-sm leading-relaxed text-muted-foreground">
                      {tip}
                    </p>
                  </li>
                );
              })}
            </ul>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
