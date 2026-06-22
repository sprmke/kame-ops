"use client";

import {
  CalendarDays,
  MoreHorizontal,
  Pencil,
  Play,
  Trash2,
} from "lucide-react";

import {
  ClickableTableRow,
  TableRowActions,
} from "@/components/shared/ClickableTableRow";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ROUTES } from "@/config/routes";
import { formatPhpAmount } from "@/lib/utils/format-money";

export type SoaPeriodRow = {
  id: string;
  label: string;
  mode: string;
  fromMonth: number;
  fromYear: number;
  toMonth: number;
  toYear: number;
  cardCount: number;
  totalDue: number;
  nextDueYmd: string | null;
  notifyTelegram: boolean;
  notifySlack: boolean;
  createCalendar: boolean;
  lastRunAt: Date | null;
};

type SoaPeriodTableProps = {
  periods: SoaPeriodRow[];
  onRerun: (period: SoaPeriodRow) => void;
  onEdit: (periodId: string) => void;
  onDelete: (periodId: string) => void;
};

function formatShortDate(ymd: string | null): string {
  if (!ymd) return "—";
  return new Date(`${ymd}T00:00:00`).toLocaleDateString("en-PH", {
    month: "short",
    day: "numeric",
  });
}

export function SoaPeriodTable({
  periods,
  onRerun,
  onEdit,
  onDelete,
}: SoaPeriodTableProps) {
  return (
    <div className="overflow-hidden rounded-lg border border-border/80">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Period</TableHead>
            <TableHead>Type</TableHead>
            <TableHead className="text-right">Cards</TableHead>
            <TableHead className="text-right">Outstanding</TableHead>
            <TableHead>Next due</TableHead>
            <TableHead>Channels</TableHead>
            <TableHead>Last run</TableHead>
            <TableHead className="w-[52px]" />
          </TableRow>
        </TableHeader>
        <TableBody>
          {periods.map((period) => (
            <ClickableTableRow
              key={period.id}
              href={ROUTES.dashboard.soaPeriod(period.id)}
            >
              <TableCell className="font-medium">
                <span className="font-display">{period.label}</span>
              </TableCell>
              <TableCell>
                <StatusBadge
                  label={period.mode === "range" ? "Range" : "Single"}
                  variant="muted"
                />
              </TableCell>
              <TableCell className="text-right tabular-nums">
                {period.cardCount}
              </TableCell>
              <TableCell className="text-right font-medium tabular-nums">
                {formatPhpAmount(period.totalDue)}
              </TableCell>
              <TableCell>{formatShortDate(period.nextDueYmd)}</TableCell>
              <TableCell>
                <div className="flex flex-wrap gap-1">
                  {period.notifyTelegram && (
                    <StatusBadge label="TG" variant="muted" />
                  )}
                  {period.notifySlack && (
                    <StatusBadge label="Slack" variant="muted" />
                  )}
                  {period.createCalendar && (
                    <StatusBadge label="Cal" variant="muted" />
                  )}
                  {!period.notifyTelegram &&
                    !period.notifySlack &&
                    !period.createCalendar && (
                      <span className="text-muted-foreground">—</span>
                    )}
                </div>
              </TableCell>
              <TableCell className="text-muted-foreground">
                {period.lastRunAt ? (
                  <span className="inline-flex items-center gap-1.5 text-xs">
                    <CalendarDays className="h-3.5 w-3.5" />
                    {new Date(period.lastRunAt).toLocaleDateString("en-PH", {
                      month: "short",
                      day: "numeric",
                      year: "numeric",
                    })}
                  </span>
                ) : (
                  "—"
                )}
              </TableCell>
              <TableRowActions>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8"
                      aria-label="Period actions"
                    >
                      <MoreHorizontal className="h-4 w-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
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
              </TableRowActions>
            </ClickableTableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
