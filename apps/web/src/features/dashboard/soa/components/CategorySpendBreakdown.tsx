"use client";

import { Loader2, Sparkles } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils/cn";
import { formatPhpAmount } from "@/lib/utils/format-money";
import { CANNOT_ANALYZE_SLUG } from "@/lib/transactions/categories";

import { useOptionalCategorizeWithAiActions } from "./CategorizeWithAiProvider";
import { categoryChartColor } from "../lib/category-chart-styles";
import type { CategorySpendRow } from "../lib/category-analytics";

const STAGGER_DELAYS = [
  "",
  "animation-delay-75",
  "animation-delay-150",
  "animation-delay-200",
  "animation-delay-300",
] as const;

type CategorySpendBreakdownProps = {
  rows: CategorySpendRow[];
  spendTotal: number;
  className?: string;
  isAnalyzing?: boolean;
  animateUpdate?: boolean;
};

export function CategorySpendBreakdown({
  rows,
  spendTotal,
  className,
  isAnalyzing: isAnalyzingProp = false,
  animateUpdate = false,
}: CategorySpendBreakdownProps) {
  const categorizeActions = useOptionalCategorizeWithAiActions();
  const isAnalyzing = isAnalyzingProp || categorizeActions?.isPending || false;
  const onCategorizeWithAi = categorizeActions?.openChoiceDialog;
  if (!rows.length) {
    return (
      <p className="py-12 text-center text-sm text-muted-foreground">
        Categorize transactions to see analytics.
      </p>
    );
  }

  return (
    <div className={cn("space-y-4", className)}>
      {rows.map((row, index) => {
        const pct =
          spendTotal > 0 ? Math.round((row.total / spendTotal) * 1000) / 10 : 0;
        const barWidth = spendTotal > 0 ? Math.max(pct, 1.5) : 0;
        const isUnanalyzed = row.slug === CANNOT_ANALYZE_SLUG;
        const color = categoryChartColor(row.slug, index);

        const stagger =
          STAGGER_DELAYS[Math.min(index, STAGGER_DELAYS.length - 1)] ?? "";

        return (
          <div
            key={row.slug}
            className={cn(
              "rounded-lg border border-transparent px-2 py-2 transition-[border-color,background-color,opacity,transform] duration-500 ease-out",
              isUnanalyzed && "border-warning/20 bg-warning/5",
              isAnalyzing && isUnanalyzed && "animate-pulse-subtle",
              animateUpdate && !isUnanalyzed && "animate-fade-in",
              animateUpdate && !isUnanalyzed && stagger,
            )}
          >
            <div className="mb-1.5 flex items-start justify-between gap-3">
              <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-1.5 gap-y-2">
                <span
                  className="h-2.5 w-2.5 shrink-0 rounded-full transition-colors duration-700 ease-out"
                  style={{ backgroundColor: color }}
                  aria-hidden
                />
                <span
                  className={cn(
                    "truncate text-sm font-medium transition-colors duration-500",
                    isUnanalyzed && "text-muted-foreground",
                  )}
                >
                  {row.label}
                </span>
                {isUnanalyzed && onCategorizeWithAi && row.count > 0 ? (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-7 shrink-0 gap-1.5 px-2.5 text-xs"
                    onClick={onCategorizeWithAi}
                    disabled={isAnalyzing}
                  >
                    {isAnalyzing ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Sparkles className="h-3.5 w-3.5" />
                    )}
                    Categorized with AI
                  </Button>
                ) : null}
              </div>
              <div className="flex shrink-0 items-baseline gap-2 tabular-nums">
                <span className="text-xs text-muted-foreground transition-all duration-700 ease-out">
                  {pct}%
                </span>
                <span className="text-sm font-semibold transition-all duration-700 ease-out">
                  {formatPhpAmount(row.total)}
                </span>
              </div>
            </div>
            <div className="relative h-2 overflow-hidden rounded-full bg-muted/50">
              <div
                className="h-full rounded-full transition-[width] duration-700 ease-out"
                style={{
                  width: `${barWidth}%`,
                  backgroundColor: color,
                  opacity: isUnanalyzed ? 0.65 : 1,
                }}
              />
            </div>
            <p className="mt-1 text-[11px] text-muted-foreground">
              {row.count} {row.count === 1 ? "transaction" : "transactions"}
            </p>
          </div>
        );
      })}
    </div>
  );
}
