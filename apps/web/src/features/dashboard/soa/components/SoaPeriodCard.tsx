"use client";

import Link from "next/link";
import {
  CalendarDays,
  Eye,
  MoreHorizontal,
  Pencil,
  Play,
  Trash2,
} from "lucide-react";

import { StatusBadge } from "@/components/shared/StatusBadge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ROUTES } from "@/config/routes";
import { formatPhpAmount } from "@/lib/utils/format-money";

import { soaPeriodCardSubtitle, soaPeriodCardTitle } from "../lib/soa-utils";
import { SoaPeriodTypeBadge } from "./SoaPeriodTypeBadge";
import { type SoaPeriodRow } from "./SoaPeriodTable";

type SoaPeriodCardProps = {
  period: SoaPeriodRow;
  onRerun: (period: SoaPeriodRow) => void;
  onEdit: (periodId: string) => void;
  onDelete: (periodId: string) => void;
};

function formatNextDue(ymd: string | null | undefined): string {
  if (!ymd) return "—";
  return new Date(`${ymd}T00:00:00`).toLocaleDateString("en-PH", {
    month: "short",
    day: "numeric",
  });
}

function formatLastRun(at: Date | string | null | undefined): string | null {
  if (!at) return null;
  return new Date(at).toLocaleDateString("en-PH", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export function SoaPeriodCard({
  period,
  onRerun,
  onEdit,
  onDelete,
}: SoaPeriodCardProps) {
  const title = soaPeriodCardTitle(period);
  const subtitle = soaPeriodCardSubtitle(period);
  const lastRun = formatLastRun(period.lastRunAt);
  const channels = [
    period.notifyTelegram ? "Telegram" : null,
    period.notifySlack ? "Slack" : null,
    period.createCalendar ? "Calendar" : null,
  ].filter((label): label is string => label != null);

  return (
    <Card className="group relative flex h-full flex-col overflow-hidden border-border/80 shadow-card transition-all hover:shadow-card-hover">
      <div className="h-1 shrink-0 bg-gradient-to-r from-primary via-[hsl(var(--chart-2))] to-primary/40" />

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className="absolute right-2 top-3 z-10 h-8 w-8 shrink-0"
            aria-label="Period actions"
          >
            <MoreHorizontal className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem asChild>
            <Link href={ROUTES.dashboard.soaPeriod(period.id)}>
              <Eye className="mr-2 h-4 w-4" />
              View
            </Link>
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => onRerun(period)}>
            <Play className="mr-2 h-4 w-4" />
            Re-run
          </DropdownMenuItem>
          <DropdownMenuItem onClick={() => onEdit(period.id)}>
            <Pencil className="mr-2 h-4 w-4" />
            Edit settings
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            className="text-destructive focus:text-destructive"
            onClick={() => onDelete(period.id)}
          >
            <Trash2 className="mr-2 h-4 w-4" />
            Delete
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <CardHeader className="space-y-0 pb-3 pr-12 pt-4">
        <CardTitle
          className="line-clamp-2 min-h-10 font-display text-sm font-semibold leading-snug"
          title={title}
        >
          {title}
        </CardTitle>
        <p
          className="mt-1 line-clamp-1 h-4 text-xs leading-4 text-muted-foreground"
          title={subtitle ?? undefined}
          aria-hidden={!subtitle}
        >
          {subtitle ?? "\u00A0"}
        </p>
        <div className="mt-2 flex min-h-[22px] flex-wrap items-center gap-1.5">
          <SoaPeriodTypeBadge
            mode={period.mode}
            withinRangeLabel={period.withinRangeLabel}
          />
          <StatusBadge label={`${period.cardCount} cards`} variant="muted" />
        </div>
      </CardHeader>

      <CardContent className="flex flex-1 flex-col gap-3 pt-0">
        <div className="grid grid-cols-2 gap-x-4 border-b border-border/60 pb-3">
          <div className="min-w-0">
            <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
              Total due
            </p>
            <p className="mt-1 font-display text-base font-bold tabular-nums leading-none">
              {formatPhpAmount(period.totalDue)}
            </p>
          </div>
          <div className="min-w-0">
            <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
              Next due
            </p>
            <p className="mt-1 text-sm font-medium tabular-nums leading-none">
              {formatNextDue(period.nextDueYmd)}
            </p>
          </div>
        </div>

        <div className="flex min-h-[22px] flex-wrap items-center gap-1.5">
          {channels.map((label) => (
            <StatusBadge key={label} label={label} variant="muted" />
          ))}
        </div>

        <p className="flex min-h-4 items-center gap-1.5 text-xs text-muted-foreground">
          {lastRun ? (
            <>
              <CalendarDays className="h-3.5 w-3.5 shrink-0" />
              <span>Last run {lastRun}</span>
            </>
          ) : (
            <span className="invisible" aria-hidden>
              Last run placeholder
            </span>
          )}
        </p>

        <Button asChild className="mt-auto w-full" variant="outline">
          <Link href={ROUTES.dashboard.soaPeriod(period.id)}>
            <Eye className="mr-2 h-4 w-4" />
            View statements
          </Link>
        </Button>
      </CardContent>
    </Card>
  );
}
