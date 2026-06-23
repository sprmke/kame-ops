"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { StatCard } from "@/components/shared/StatCard";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatPhpAmount } from "@/lib/utils/format-money";

import {
  aggregateCategorySpend,
  countUnanalyzed,
  type CategorizedTx,
} from "../lib/category-analytics";
import type { SoaStatement } from "../lib/soa-utils";

const CHART_COLORS = [
  "hsl(var(--chart-1))",
  "hsl(var(--chart-2))",
  "hsl(var(--chart-3))",
  "hsl(var(--chart-4))",
  "hsl(var(--chart-5))",
  "hsl(var(--primary))",
];

function buildPieData(categoryRows: ReturnType<typeof aggregateCategorySpend>) {
  const top = categoryRows.slice(0, 5);
  const restTotal = categoryRows
    .slice(5)
    .reduce((sum, row) => sum + row.total, 0);

  const slices = top.map((row) => ({
    name: row.label,
    value: row.total,
  }));

  if (restTotal > 0) {
    slices.push({ name: "Other", value: restTotal });
  }

  return slices;
}

function flattenTransactions(statements: SoaStatement[]): CategorizedTx[] {
  return statements.flatMap((s) =>
    (s.transactions ?? []).map((t) => ({
      id: t.id,
      description: t.description,
      amount: t.amount,
      categorySlug: t.categorySlug,
      categoryLabel: t.categoryLabel,
    })),
  );
}

type SoaPeriodOverviewTabProps = {
  statements: SoaStatement[];
  totalDue: number;
  cardCount: number;
};

export function SoaPeriodOverviewTab({
  statements,
  totalDue,
  cardCount,
}: SoaPeriodOverviewTabProps) {
  const transactions = flattenTransactions(statements);
  const categoryRows = aggregateCategorySpend(transactions);
  const unanalyzed = countUnanalyzed(transactions);
  const spendTotal = categoryRows.reduce((s, r) => s + r.total, 0);

  const pieData = buildPieData(categoryRows);

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard title="Spend tracked" value={formatPhpAmount(spendTotal)} />
        <StatCard title="Transactions" value={transactions.length} />
        <StatCard title="Categories" value={categoryRows.length} />
        <StatCard title="Cannot analyze" value={unanalyzed} />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Spend by category</CardTitle>
          </CardHeader>
          <CardContent className="h-72">
            {pieData.length ? (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={pieData}
                    dataKey="value"
                    nameKey="name"
                    cx="50%"
                    cy="50%"
                    innerRadius="52%"
                    outerRadius="78%"
                    paddingAngle={0}
                    stroke="none"
                    isAnimationActive={false}
                  >
                    {pieData.map((entry, i) => (
                      <Cell
                        key={entry.name}
                        fill={CHART_COLORS[i % CHART_COLORS.length]}
                        stroke="none"
                      />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={{
                      background: "hsl(var(--card))",
                      border: "1px solid hsl(var(--border))",
                      borderRadius: "8px",
                      color: "hsl(var(--card-foreground))",
                    }}
                    itemStyle={{ color: "hsl(var(--foreground))" }}
                    labelStyle={{ color: "hsl(var(--foreground))" }}
                    formatter={(value: number, name: string) => [
                      formatPhpAmount(value),
                      name,
                    ]}
                  />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <p className="flex h-full items-center justify-center text-sm text-muted-foreground">
                No categorized spend yet.
              </p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Period summary</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <div className="flex justify-between">
              <span className="text-muted-foreground">Cards</span>
              <span className="font-medium tabular-nums">{cardCount}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Total due</span>
              <span className="font-medium tabular-nums">
                {formatPhpAmount(totalDue)}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">Top category</span>
              <span className="font-medium">
                {categoryRows[0]?.label ?? "—"}
              </span>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

export function SoaPeriodAnalyticsTab({
  statements,
}: {
  statements: SoaStatement[];
}) {
  const transactions = flattenTransactions(statements);
  const categoryRows = aggregateCategorySpend(transactions);
  const unanalyzed = countUnanalyzed(transactions);

  const barData = categoryRows.map((r) => ({
    name: r.label,
    total: r.total,
    count: r.count,
  }));

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

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Category breakdown</CardTitle>
        </CardHeader>
        <CardContent className="h-80">
          {barData.length ? (
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={barData}
                margin={{ top: 8, right: 8, left: 0, bottom: 48 }}
              >
                <CartesianGrid
                  strokeDasharray="3 3"
                  className="stroke-border"
                />
                <XAxis
                  dataKey="name"
                  tick={{ fontSize: 10 }}
                  angle={-30}
                  textAnchor="end"
                  height={60}
                />
                <YAxis tick={{ fontSize: 10 }} />
                <Tooltip
                  contentStyle={{
                    background: "hsl(var(--card))",
                    border: "1px solid hsl(var(--border))",
                    borderRadius: "8px",
                  }}
                  formatter={(value: number) => formatPhpAmount(value)}
                />
                <Bar
                  dataKey="total"
                  fill="hsl(var(--primary))"
                  radius={[4, 4, 0, 0]}
                />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <p className="flex h-full items-center justify-center text-sm text-muted-foreground">
              Categorize transactions to see analytics.
            </p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Tips</CardTitle>
        </CardHeader>
        <CardContent>
          <ul className="space-y-2 text-sm text-muted-foreground">
            {tips.map((tip) => (
              <li key={tip} className="list-inside list-disc">
                {tip}
              </li>
            ))}
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}
