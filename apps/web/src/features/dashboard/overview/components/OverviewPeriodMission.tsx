"use client";

import Link from "next/link";
import type { Route } from "next";
import {
  AlertCircle,
  ArrowRight,
  Bell,
  CheckCircle2,
  Circle,
} from "lucide-react";

import { StatusBadge } from "@/components/shared/StatusBadge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ROUTES } from "@/config/routes";
import { formatDueCardTitle } from "@/features/dashboard/reminders/lib/reminder-utils";
import { cn } from "@/lib/utils/cn";
import { formatPhpAmount } from "@/lib/utils/format-money";

type AttentionItem = {
  id: string;
  label: string;
  detail?: string;
  href: Route;
  variant: "warning" | "destructive" | "muted";
};

type OverviewPeriodMissionProps = {
  periodLabel: string;
  periodId: string;
  paidCardCount: number;
  cardCount: number;
  totalPaid: number;
  outstandingDue: number;
  grossStatementDue: number;
  grossMinimumDue: number;
  minimumRemaining: number;
  minimumMetCardCount: number;
  nextDueYmd: string | null;
  periodCards: Array<{
    label: string;
    issuerId: string;
    cardLast4: string;
    grossMinimumDue: number;
    minimumRemaining: number;
    minimumMet: boolean;
    markedPaid: boolean;
    outstandingDue: number;
    paidAmount: number;
  }>;
  upcomingDues: Array<{
    id: string;
    issuerId: string;
    bankLabel: string;
    cardLast4: string;
    cardDisplayLabel: string | null;
    dueDate: string;
    dueDateYmd: string;
    statementPeriodKey: string;
    statementPeriodLabel: string;
    minimumDue: string;
    totalDue: string;
    paidAt: Date | null;
    daysAway: number;
  }>;
  remindersReady: number;
  remindersInWindow: number;
  unanalyzedCount: number;
};

function ProgressTrack({
  value,
  variant = "primary",
}: {
  value: number;
  variant?: "primary" | "success" | "warning";
}) {
  const pct = Math.min(100, Math.max(0, value));
  return (
    <div className="h-2.5 w-full overflow-hidden rounded-full bg-muted">
      <div
        className={cn(
          "h-full rounded-full transition-all duration-500 ease-out",
          variant === "success" && "bg-[hsl(var(--success))]",
          variant === "warning" && "bg-warning",
          variant === "primary" && "bg-primary",
        )}
        style={{ width: `${pct}%` }}
      />
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

function formatDaysAway(daysAway: number): string {
  if (daysAway < 0) return `${Math.abs(daysAway)}d overdue`;
  if (daysAway === 0) return "Due today";
  if (daysAway === 1) return "Due tomorrow";
  return `Due in ${daysAway}d`;
}

export function OverviewPeriodMission({
  periodLabel,
  periodId,
  paidCardCount,
  cardCount,
  totalPaid,
  outstandingDue,
  grossStatementDue,
  grossMinimumDue,
  minimumRemaining,
  minimumMetCardCount,
  nextDueYmd,
  periodCards,
  upcomingDues,
  remindersReady,
  remindersInWindow,
  unanalyzedCount,
}: OverviewPeriodMissionProps) {
  const statementTotal =
    grossStatementDue > 0 ? grossStatementDue : totalPaid + outstandingDue;
  const paymentProgress =
    statementTotal > 0 ? Math.round((totalPaid / statementTotal) * 100) : 100;
  const minimumCleared = minimumMetCardCount >= cardCount && cardCount > 0;
  const minimumProgress =
    cardCount > 0 ? Math.round((minimumMetCardCount / cardCount) * 100) : 100;
  const cardsBelowMinimum = periodCards.filter(
    (card) => !card.minimumMet && card.grossMinimumDue > 0,
  );
  const cardsComplete = cardCount > 0 && paidCardCount >= cardCount;
  const cardProgress =
    cardCount > 0 ? Math.round((paidCardCount / cardCount) * 100) : 0;

  const attention: AttentionItem[] = [];

  const upcomingDueKeys = new Set(
    upcomingDues.map((due) => `${due.issuerId}:${due.cardLast4}`),
  );

  for (const card of cardsBelowMinimum) {
    const key = `${card.issuerId}:${card.cardLast4}`;
    if (upcomingDueKeys.has(key)) continue;

    attention.push({
      id: `min-${key}`,
      label: card.label,
      detail: card.markedPaid
        ? `Paid ${formatPhpAmount(card.paidAmount)} · min ${formatPhpAmount(card.grossMinimumDue)}`
        : `Min ${formatPhpAmount(card.grossMinimumDue)} · not paid`,
      href: ROUTES.dashboard.reminders,
      variant: card.markedPaid ? "warning" : "destructive",
    });
  }

  for (const due of upcomingDues) {
    attention.push({
      id: due.id,
      label: formatDueCardTitle(due),
      detail: `${due.totalDue} · ${formatDaysAway(due.daysAway)}`,
      href: ROUTES.dashboard.reminders,
      variant:
        due.daysAway < 0
          ? "destructive"
          : due.daysAway <= 3
            ? "warning"
            : "muted",
    });
  }

  if (remindersReady > 0) {
    attention.push({
      id: "reminders-ready",
      label: `${remindersReady} reminder${remindersReady === 1 ? "" : "s"} ready to send`,
      href: ROUTES.dashboard.reminders,
      variant: "warning",
    });
  }

  if (unanalyzedCount > 0) {
    attention.push({
      id: "unanalyzed",
      label: `${unanalyzedCount} uncategorized transaction${unanalyzedCount === 1 ? "" : "s"}`,
      href: ROUTES.dashboard.soaPeriod(periodId) as Route,
      variant: "muted",
    });
  }

  const allClear =
    cardsComplete && outstandingDue <= 0 && attention.length === 0;

  return (
    <Card className="overflow-hidden border-border/80 shadow-card">
      <div
        className={cn(
          "w-full h-1",
          allClear
            ? "bg-[hsl(var(--success))]"
            : "bg-gradient-to-r from-primary via-[hsl(var(--chart-2))] to-primary/60",
        )}
      />
      <CardContent className="p-5 space-y-6 sm:p-6">
        <div className="flex flex-wrap gap-4 justify-between items-start">
          <div className="space-y-1">
            <div className="flex flex-wrap gap-2 items-center">
              {allClear ? (
                <CheckCircle2 className="h-5 w-5 text-[hsl(var(--success))]" />
              ) : (
                <Circle className="w-5 h-5 text-primary" />
              )}
              <h2 className="text-lg font-semibold tracking-tight font-display">
                {allClear ? "All caught up" : periodLabel}
              </h2>
              {cardsComplete && !allClear ? (
                <StatusBadge label="Cards paid" variant="success" />
              ) : null}
            </div>
            <p className="text-sm text-muted-foreground">
              {allClear
                ? `${periodLabel} — every card is paid`
                : nextDueYmd
                  ? `Next due ${formatNextDue(nextDueYmd)}`
                  : null}
            </p>
          </div>
          <Button variant="outline" size="sm" asChild>
            <Link href={ROUTES.dashboard.soaPeriod(periodId)}>
              View SOA
              <ArrowRight className="ml-1.5 h-3.5 w-3.5" />
            </Link>
          </Button>
        </div>

        <div className="grid gap-5 sm:grid-cols-3">
          <div className="space-y-2">
            <div className="flex gap-2 justify-between items-baseline text-sm">
              <span className="text-muted-foreground">Paid vs statement</span>
              <span className="font-medium tabular-nums">
                {paymentProgress}%
              </span>
            </div>
            <ProgressTrack
              value={paymentProgress}
              variant={paymentProgress >= 100 ? "success" : "primary"}
            />
            <p className="text-xs tabular-nums text-muted-foreground">
              {formatPhpAmount(totalPaid)} paid ·{" "}
              {formatPhpAmount(outstandingDue)} outstanding
            </p>
          </div>

          <div className="space-y-2">
            <div className="flex gap-2 justify-between items-baseline text-sm">
              <span className="text-muted-foreground">Minimum met</span>
              <span className="font-medium tabular-nums">
                {minimumCleared ? "All" : `${minimumMetCardCount}/${cardCount}`}
              </span>
            </div>
            <ProgressTrack
              value={minimumProgress}
              variant={minimumCleared ? "success" : "warning"}
            />
            <p className="text-xs text-muted-foreground">
              {minimumCleared
                ? `Sum of mins ${formatPhpAmount(grossMinimumDue)}`
                : cardsBelowMinimum.length === 1
                  ? `${cardsBelowMinimum[0]!.label} · min ${formatPhpAmount(cardsBelowMinimum[0]!.minimumRemaining || cardsBelowMinimum[0]!.grossMinimumDue)}`
                  : `${cardsBelowMinimum.length} cards below minimum`}
            </p>
          </div>

          <div className="space-y-2">
            <div className="flex gap-2 justify-between items-baseline text-sm">
              <span className="text-muted-foreground">Cards</span>
              <span className="font-medium tabular-nums">
                {paidCardCount}/{cardCount}
              </span>
            </div>
            <ProgressTrack
              value={cardProgress}
              variant={cardsComplete ? "success" : "primary"}
            />
            <p className="text-xs text-muted-foreground">
              {cardsComplete
                ? "All cards marked paid"
                : `${cardCount - paidCardCount} card${cardCount - paidCardCount === 1 ? "" : "s"} unpaid`}
            </p>
          </div>
        </div>

        {attention.length > 0 ? (
          <div className="pt-5 space-y-2 border-t border-border/60">
            <p className="text-xs font-medium tracking-wide uppercase text-muted-foreground">
              Needs attention
            </p>
            <ul className="space-y-2">
              {attention.map((item) => (
                <li key={item.id}>
                  <Link
                    href={item.href}
                    className="flex items-center justify-between gap-3 rounded-lg border border-border/80 px-3 py-2.5 transition-colors hover:bg-muted/40"
                  >
                    <div className="flex min-w-0 items-center gap-2.5">
                      <AlertCircle
                        className={cn(
                          "h-4 w-4 shrink-0",
                          item.variant === "destructive" && "text-destructive",
                          item.variant === "warning" && "text-warning",
                          item.variant === "muted" && "text-muted-foreground",
                        )}
                      />
                      <div className="min-w-0">
                        <p className="text-sm font-medium truncate">
                          {item.label}
                        </p>
                        {item.detail ? (
                          <p className="text-xs truncate text-muted-foreground">
                            {item.detail}
                          </p>
                        ) : null}
                      </div>
                    </div>
                    <ArrowRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ) : remindersInWindow > 0 ? (
          <div className="flex gap-2 items-center pt-5 text-sm border-t border-border/60 text-muted-foreground">
            <Bell className="w-4 h-4 shrink-0" />
            <span>
              {remindersInWindow} card
              {remindersInWindow === 1 ? "" : "s"} in reminder window
            </span>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
