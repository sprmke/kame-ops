"use client";

import Link from "next/link";
import {
  Bell,
  CreditCard,
  FileText,
  Zap,
  ArrowRight,
  Clock,
} from "lucide-react";
import { formatDistanceToNow } from "date-fns";

import { DashboardPageHeader } from "@/components/shared/DashboardPageHeader";
import { LoadingSpinner } from "@/components/shared/LoadingSpinner";
import { StatCard } from "@/components/shared/StatCard";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { ROUTES } from "@/config/routes";
import { api } from "@/lib/api/client";

const QUICK_ACTIONS = [
  {
    title: "Run SOA",
    href: ROUTES.dashboard.soa,
    description: "Fetch & parse statements",
  },
  {
    title: "Send reminders",
    href: ROUTES.dashboard.reminders,
    description: "Due-date pings",
  },
  {
    title: "Add card",
    href: ROUTES.dashboard.creditCards,
    description: "Register a new card",
  },
] as const;

export function OverviewPage() {
  const { data: stats, isLoading, error } = api.overview.stats.useQuery();

  if (isLoading) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <LoadingSpinner size="lg" />
      </div>
    );
  }

  if (error) {
    return (
      <p className="text-destructive">
        Failed to load dashboard. Please refresh.
      </p>
    );
  }

  return (
    <div className="space-y-8">
      <DashboardPageHeader
        title="Overview"
        description="Your automation command center — credit cards, SOA runs, and due reminders at a glance."
        actions={
          <Button asChild>
            <Link href={ROUTES.dashboard.soa}>Run SOA</Link>
          </Button>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          title="Credit cards"
          value={stats?.cards ?? 0}
          subtitle="Active cards tracked"
          icon={CreditCard}
        />
        <StatCard
          title="Unpaid dues"
          value={stats?.unpaidDues ?? 0}
          subtitle="In reminder window"
          icon={Bell}
        />
        <StatCard
          title="SOA statements"
          value={stats?.statements ?? 0}
          subtitle={
            stats?.lastSoaAt
              ? `Last run ${formatDistanceToNow(new Date(stats.lastSoaAt), { addSuffix: true })}`
              : "No runs yet"
          }
          icon={FileText}
        />
        <StatCard
          title="Automations"
          value={stats?.activeAutomations ?? 0}
          subtitle="Active scheduled jobs"
          icon={Zap}
        />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Upcoming payments</CardTitle>
            <CardDescription>Next unpaid due dates</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {stats?.upcomingDues?.length ? (
              stats.upcomingDues.map((d) => (
                <div
                  key={d.id}
                  className="flex items-center justify-between rounded-lg border border-border bg-muted/30 px-3 py-2"
                >
                  <div>
                    <p className="text-sm font-medium">
                      {d.bankLabel} · {d.cardLast4}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Due {d.dueDate} · {d.totalDue}
                    </p>
                  </div>
                  <StatusBadge label="Unpaid" variant="warning" />
                </div>
              ))
            ) : (
              <p className="text-sm text-muted-foreground">
                No upcoming dues. Run SOA to populate.
              </p>
            )}
            <Button variant="ghost" size="sm" className="w-full" asChild>
              <Link href={ROUTES.dashboard.reminders}>
                View all reminders
                <ArrowRight className="ml-1 h-3 w-3" />
              </Link>
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Recent automation runs</CardTitle>
            <CardDescription>Latest job executions</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            {stats?.recentRuns?.length ? (
              stats.recentRuns.map((run) => (
                <div
                  key={run.id}
                  className="flex items-center justify-between gap-2 rounded-lg border border-border px-3 py-2"
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">
                      {run.job?.name ?? "Job"}
                    </p>
                    <p className="flex items-center gap-1 text-xs text-muted-foreground">
                      <Clock className="h-3 w-3" />
                      {formatDistanceToNow(new Date(run.startedAt), {
                        addSuffix: true,
                      })}
                    </p>
                  </div>
                  <StatusBadge
                    label={run.status}
                    variant={
                      run.status === "completed"
                        ? "success"
                        : run.status === "failed"
                          ? "destructive"
                          : "muted"
                    }
                  />
                </div>
              ))
            ) : (
              <p className="text-sm text-muted-foreground">
                No runs yet. Create an automation.
              </p>
            )}
            <Button variant="ghost" size="sm" className="w-full" asChild>
              <Link href={ROUTES.dashboard.automations}>
                Manage automations
                <ArrowRight className="ml-1 h-3 w-3" />
              </Link>
            </Button>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        {QUICK_ACTIONS.map((action) => (
          <Link key={action.href} href={action.href}>
            <Card
              variant="interactive"
              className="h-full hover:border-primary/40 hover:bg-accent/40"
            >
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">{action.title}</CardTitle>
                <CardDescription className="text-xs">
                  {action.description}
                </CardDescription>
              </CardHeader>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}
