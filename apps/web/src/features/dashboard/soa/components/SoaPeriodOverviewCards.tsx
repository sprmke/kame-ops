"use client";

import type { ReactNode } from "react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatPhpAmount } from "@/lib/utils/format-money";

import type { CategorySpendRow } from "../lib/category-analytics";
import { CategorySpendDonut, CategorySpendLegend } from "./CategorySpendDonut";

function SummaryRow({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="flex justify-between gap-4">
      <span className="shrink-0 text-muted-foreground">{label}</span>
      <span className="min-w-0 text-right font-medium tabular-nums">
        {value}
      </span>
    </div>
  );
}

function formatNextDue(ymd: string | null | undefined): string {
  if (!ymd) return "—";
  return new Date(`${ymd}T00:00:00`).toLocaleDateString("en-PH", {
    month: "short",
    day: "numeric",
  });
}

type SoaPeriodSpendByCategoryCardProps = {
  rows: CategorySpendRow[];
  spendTotal: number;
  className?: string;
};

export function SoaPeriodSpendByCategoryCard({
  rows,
  spendTotal,
  className,
}: SoaPeriodSpendByCategoryCardProps) {
  return (
    <Card className={className ?? "border-border/80 shadow-card"}>
      <CardHeader>
        <CardTitle className="font-display text-base">
          Spend by category
        </CardTitle>
      </CardHeader>
      <CardContent>
        <CategorySpendDonut rows={rows} spendTotal={spendTotal} />
        <CategorySpendLegend rows={rows} />
      </CardContent>
    </Card>
  );
}

export type SoaPeriodSummaryCardProps = {
  totalPaid: number;
  /** Remaining statement balance across cards (after payments). */
  outstandingDue: number;
  /** Sum of statement total-due amounts for all cards in the period. */
  grossStatementDue: number;
  /** Sum of statement minimum-due amounts for all cards in the period. */
  grossMinimumDue: number;
  /** Minimum still owed on cards that have not met their minimum yet. */
  minimumRemaining: number;
  minimumMetCardCount: number;
  cardCount: number;
  paidCardCount: number;
  nextDueYmd: string | null;
  spendTotal: number;
  topCategory?: { label: string; share: number | null };
  interestFeesTotal?: number;
  unanalyzedCount?: number;
  className?: string;
};

export function SoaPeriodSummaryCard({
  totalPaid,
  outstandingDue,
  grossStatementDue,
  grossMinimumDue,
  minimumRemaining,
  minimumMetCardCount,
  cardCount,
  paidCardCount,
  nextDueYmd,
  spendTotal,
  topCategory,
  interestFeesTotal = 0,
  unanalyzedCount = 0,
  className,
}: SoaPeriodSummaryCardProps) {
  return (
    <Card className={className ?? "border-border/80 shadow-card"}>
      <CardHeader>
        <CardTitle className="font-display text-base">Period summary</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        <SummaryRow label="Total paid" value={formatPhpAmount(totalPaid)} />
        <SummaryRow
          label="Total due"
          value={formatPhpAmount(grossStatementDue)}
        />
        {outstandingDue > 0 ? (
          <SummaryRow
            label="Outstanding"
            value={formatPhpAmount(outstandingDue)}
          />
        ) : null}
        <SummaryRow
          label="Minimum due"
          value={formatPhpAmount(grossMinimumDue)}
        />
        <SummaryRow
          label="Minimum met"
          value={cardCount > 0 ? `${minimumMetCardCount} / ${cardCount}` : "—"}
        />
        {minimumRemaining > 0 ? (
          <SummaryRow
            label="Minimum remaining"
            value={formatPhpAmount(minimumRemaining)}
          />
        ) : null}
        <SummaryRow
          label="Cards paid"
          value={cardCount > 0 ? `${paidCardCount} / ${cardCount}` : "—"}
        />
        <SummaryRow label="Next due" value={formatNextDue(nextDueYmd)} />

        <div className="border-t border-border/60 pt-3" />

        <SummaryRow label="Spend tracked" value={formatPhpAmount(spendTotal)} />
        <SummaryRow
          label="Top category"
          value={
            topCategory ? (
              <span className="truncate">
                {topCategory.label}
                {topCategory.share !== null ? ` · ${topCategory.share}%` : ""}
              </span>
            ) : (
              "—"
            )
          }
        />
        {interestFeesTotal > 0 ? (
          <SummaryRow
            label="Interest & fees"
            value={formatPhpAmount(interestFeesTotal)}
          />
        ) : null}
        {unanalyzedCount > 0 ? (
          <SummaryRow label="Uncategorized" value={`${unanalyzedCount} tx`} />
        ) : null}
      </CardContent>
    </Card>
  );
}
