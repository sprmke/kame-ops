"use client";

import Link from "next/link";
import { AlertTriangle, ArrowRight } from "lucide-react";

import { DashboardPageHeader } from "@/components/shared/DashboardPageHeader";
import { OverviewContentSkeleton } from "@/components/shared/skeletons";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ROUTES } from "@/config/routes";
import {
  SoaPeriodSpendByCategoryCard,
  SoaPeriodSummaryCard,
} from "@/features/dashboard/soa/components/SoaPeriodOverviewCards";
import { api } from "@/lib/api/client";

import { OverviewPeriodMission } from "./OverviewPeriodMission";

export function OverviewPage() {
  const { data: stats, isLoading, error } = api.overview.stats.useQuery();

  if (error) {
    return (
      <p className="text-destructive">
        Failed to load dashboard. Please refresh.
      </p>
    );
  }

  const period = stats?.latestPeriod;
  const missingSoaDues =
    stats?.upcomingDues.filter((due) => due.source === "expected") ?? [];

  return (
    <div className="space-y-8">
      <DashboardPageHeader
        title="Overview"
        actions={
          <Button asChild>
            <Link href={ROUTES.dashboard.soa}>Run SOA</Link>
          </Button>
        }
      />

      {!isLoading && missingSoaDues.length > 0 ? (
        <Card className="border-warning/50 bg-warning/10 shadow-card">
          <CardContent className="flex flex-col gap-4 p-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex min-w-0 gap-3">
              <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-warning" />
              <div>
                <p className="font-display font-semibold">SOA missing</p>
                <p className="text-sm text-muted-foreground">
                  {missingSoaDues.length} card
                  {missingSoaDues.length === 1 ? "" : "s"} near the expected due
                  date. Check email or your bank app.
                </p>
              </div>
            </div>
            <Button variant="outline" size="sm" asChild>
              <Link href={ROUTES.dashboard.reminders}>
                View due dates
                <ArrowRight className="ml-1.5 h-3.5 w-3.5" />
              </Link>
            </Button>
          </CardContent>
        </Card>
      ) : null}

      {isLoading ? (
        <OverviewContentSkeleton />
      ) : period ? (
        <>
          <OverviewPeriodMission
            periodLabel={period.label}
            periodId={period.id}
            paidCardCount={period.paidCardCount}
            cardCount={period.cardCount}
            totalPaid={period.totalPaid}
            outstandingDue={period.totalDue}
            grossStatementDue={period.grossStatementDue}
            grossMinimumDue={period.grossMinimumDue}
            minimumRemaining={period.totalMinimum}
            minimumMetCardCount={period.minimumMetCardCount}
            nextDueYmd={period.nextDueYmd}
            periodCards={period.periodCards}
            upcomingDues={stats.upcomingDues ?? []}
            remindersReady={stats.reminders.readyCount}
            remindersInWindow={stats.reminders.inWindowCount}
            unanalyzedCount={period.unanalyzed}
          />

          <div className="grid gap-6 lg:grid-cols-2">
            <SoaPeriodSpendByCategoryCard
              rows={period.analyzedCategoryRows}
              spendTotal={period.spendTotal}
            />
            <SoaPeriodSummaryCard
              totalPaid={period.totalPaid}
              outstandingDue={period.totalDue}
              grossStatementDue={period.grossStatementDue}
              grossMinimumDue={period.grossMinimumDue}
              minimumRemaining={period.totalMinimum}
              minimumMetCardCount={period.minimumMetCardCount}
              cardCount={period.cardCount}
              paidCardCount={period.paidCardCount}
              nextDueYmd={period.nextDueYmd}
              spendTotal={period.spendTotal}
              topCategory={period.topCategory ?? undefined}
              interestFeesTotal={period.interestFeesTotal}
              unanalyzedCount={period.unanalyzed}
            />
          </div>
        </>
      ) : (
        <div className="px-6 py-16 text-center rounded-xl border border-dashed border-border bg-card/50 shadow-card">
          <p className="text-lg font-semibold font-display">No SOA data yet</p>
          <p className="mt-2 text-sm text-muted-foreground">
            Run SOA to fetch statements and track payments.
          </p>
          <Button className="mt-6" asChild>
            <Link href={ROUTES.dashboard.soa}>Run SOA</Link>
          </Button>
        </div>
      )}
    </div>
  );
}
