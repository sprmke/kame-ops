import {
  CANNOT_ANALYZE_SLUG,
  type TransactionCategorySlug,
} from "@/lib/transactions/categories";

/** Ordered for maximum hue separation — each adjacent slice stays visually distinct. */
export const CHART_PALETTE = [
  "hsl(var(--chart-4))",
  "hsl(var(--chart-3))",
  "hsl(var(--chart-6))",
  "hsl(var(--chart-1))",
  "hsl(var(--chart-7))",
  "hsl(var(--chart-5))",
  "hsl(var(--chart-8))",
  "hsl(var(--chart-2))",
] as const;

export const CANNOT_ANALYZE_CHART_COLOR = "hsl(var(--muted-foreground) / 0.45)";

export function chartColorAtIndex(index: number): string {
  return CHART_PALETTE[
    ((index % CHART_PALETTE.length) + CHART_PALETTE.length) %
      CHART_PALETTE.length
  ]!;
}

export function categoryChartColor(
  slug: TransactionCategorySlug,
  index: number,
): string {
  if (slug === CANNOT_ANALYZE_SLUG) {
    return CANNOT_ANALYZE_CHART_COLOR;
  }
  return chartColorAtIndex(index);
}
