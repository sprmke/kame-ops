"use client";

import { CheckCircle2, RotateCcw } from "lucide-react";

import { StatusBadge } from "@/components/shared/StatusBadge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils/cn";

import {
  dueCardLabel,
  formatDueCardTitle,
  type DueEntryListItem,
} from "../lib/reminder-utils";

function statusVariant(
  status: string,
): "success" | "warning" | "muted" | "default" {
  if (status === "in_window_ready") return "warning";
  if (status === "paid") return "success";
  if (status === "in_window_already_sent") return "default";
  return "muted";
}

type DueEntryCardProps = {
  entry: DueEntryListItem;
  reminderStatus?: {
    statusLabel: string;
    status: string;
  };
  showCardMeta?: boolean;
  onMarkPaid?: () => void;
  onMarkUnpaid?: () => void;
  disabled?: boolean;
};

export function DueEntryCard({
  entry,
  reminderStatus,
  showCardMeta = true,
  onMarkPaid,
  onMarkUnpaid,
  disabled,
}: DueEntryCardProps) {
  const paid = Boolean(entry.paidAt);
  const title = formatDueCardTitle(entry);
  const cardLabel = dueCardLabel(entry);
  const showCardLabel = cardLabel !== title && !title.includes(cardLabel);

  return (
    <Card className={cn("border-border/80 shadow-card", paid && "opacity-90")}>
      <CardHeader className="flex flex-row items-start justify-between gap-2 pb-2">
        <div className="min-w-0 space-y-0.5">
          <CardTitle
            className="truncate font-display text-sm font-semibold leading-snug"
            title={title}
          >
            {title}
          </CardTitle>
          {showCardLabel ? (
            <p className="truncate text-xs text-muted-foreground">
              {cardLabel}
            </p>
          ) : null}
          <p className="text-[11px] text-muted-foreground">
            Due {entry.dueDate}
          </p>
        </div>
        <StatusBadge
          label={paid ? "Paid" : "Unpaid"}
          variant={paid ? "success" : "warning"}
        />
      </CardHeader>
      <CardContent className="space-y-3">
        {reminderStatus && (
          <StatusBadge
            label={reminderStatus.statusLabel}
            variant={statusVariant(reminderStatus.status)}
            className="w-full justify-center truncate py-1"
          />
        )}
        {showCardMeta && (
          <>
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Minimum</span>
              <span className="font-medium">{entry.minimumDue}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Total due</span>
              <span className="font-semibold">{entry.totalDue}</span>
            </div>
          </>
        )}
        {paid ? (
          <Button
            variant="outline"
            size="sm"
            className="w-full"
            onClick={onMarkUnpaid}
            disabled={disabled}
          >
            <RotateCcw className="mr-2 h-3 w-3" />
            Mark unpaid
          </Button>
        ) : (
          <Button
            size="sm"
            className="w-full"
            onClick={onMarkPaid}
            disabled={disabled}
          >
            <CheckCircle2 className="mr-2 h-3 w-3" />
            Mark paid
          </Button>
        )}
      </CardContent>
    </Card>
  );
}
