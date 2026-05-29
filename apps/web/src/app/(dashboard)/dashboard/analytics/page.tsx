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

import { DashboardPageHeader } from "@/components/shared/DashboardPageHeader";
import { LoadingSpinner } from "@/components/shared/LoadingSpinner";
import { StatCard } from "@/components/shared/StatCard";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { api } from "@/lib/api/client";

const CHART_COLORS = [
  "hsl(var(--primary))",
  "hsl(var(--chart-2))",
  "hsl(var(--warning))",
  "hsl(var(--chart-4))",
];

function parseAmount(raw: string): number {
  return Number.parseFloat(raw.replace(/[^0-9.]/g, "")) || 0;
}

export default function AnalyticsPage() {
  const { data: dues, isLoading } = api.reminders.listDue.useQuery({
    unpaidOnly: false,
  });
  const { data: stats } = api.overview.stats.useQuery();

  const unpaid = dues?.filter((d) => !d.paidAt) ?? [];
  const paid = dues?.filter((d) => d.paidAt) ?? [];

  const barData = unpaid.map((d) => ({
    name: `${d.issuerId} ${d.cardLast4}`,
    total: parseAmount(d.totalDue),
  }));

  const pieData = [
    { name: "Unpaid", value: unpaid.length },
    { name: "Paid", value: paid.length },
  ].filter((d) => d.value > 0);

  const totalUnpaid = unpaid.reduce(
    (sum, d) => sum + parseAmount(d.totalDue),
    0,
  );

  if (isLoading) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <LoadingSpinner size="lg" />
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <DashboardPageHeader
        title="Analytics"
        description="Spending and due-date insights from your tracked credit cards."
      />

      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard
          title="Total unpaid"
          value={`₱${totalUnpaid.toLocaleString("en-PH", { maximumFractionDigits: 0 })}`}
          subtitle={`${unpaid.length} card(s) with open balance`}
        />
        <StatCard
          title="Paid this cycle"
          value={paid.length}
          subtitle="Marked paid in KameOps"
        />
        <StatCard
          title="SOA runs"
          value={stats?.statements ?? 0}
          subtitle="Statements in history"
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Total due by card</CardTitle>
          </CardHeader>
          <CardContent className="h-72">
            {barData.length ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={barData}
                  margin={{ top: 8, right: 8, left: 0, bottom: 0 }}
                >
                  <CartesianGrid
                    strokeDasharray="3 3"
                    className="stroke-border"
                  />
                  <XAxis dataKey="name" tick={{ fontSize: 10 }} />
                  <YAxis tick={{ fontSize: 10 }} />
                  <Tooltip
                    contentStyle={{
                      background: "hsl(var(--card))",
                      border: "1px solid hsl(var(--border))",
                      borderRadius: "8px",
                    }}
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
                No unpaid dues to chart.
              </p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Payment status</CardTitle>
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
                    innerRadius={50}
                    outerRadius={80}
                    paddingAngle={4}
                  >
                    {pieData.map((_, i) => (
                      <Cell
                        key={i}
                        fill={CHART_COLORS[i % CHART_COLORS.length]}
                      />
                    ))}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
            ) : (
              <p className="flex h-full items-center justify-center text-sm text-muted-foreground">
                Run SOA to populate due data.
              </p>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
