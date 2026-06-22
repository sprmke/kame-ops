"use client";

import { Bell, CheckCircle2, RotateCcw } from "lucide-react";
import { toast } from "sonner";

import { DashboardPageHeader } from "@/components/shared/DashboardPageHeader";
import { EmptyState } from "@/components/shared/EmptyState";
import { LoadingSpinner } from "@/components/shared/LoadingSpinner";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { api } from "@/lib/api/client";
import {
  formatDaysBeforeDue,
  inWindowCountLabel,
} from "@/lib/reminders/reminder-labels";
import { cn } from "@/lib/utils/cn";
import { sentRemindersMessage } from "@/lib/utils/toast-messages";

function statusVariant(
  status: string,
): "success" | "warning" | "muted" | "default" {
  if (status === "in_window_ready") return "warning";
  if (status === "paid") return "success";
  if (status === "in_window_already_sent") return "default";
  return "muted";
}

export function RemindersPage() {
  const utils = api.useUtils();
  const { data: dues, isLoading } = api.reminders.listDue.useQuery({
    unpaidOnly: false,
  });
  const { data: status } = api.reminders.status.useQuery();

  const sendNow = api.reminders.sendNow.useMutation({
    onSuccess: (r) => {
      if (r.message) {
        toast.message(r.message);
      } else {
        toast.success(sentRemindersMessage(r.sent));
      }
      void utils.reminders.status.invalidate();
      void utils.reminders.listDue.invalidate();
    },
    onError: (e) => toast.error(e.message),
  });

  const markPaid = api.reminders.markPaid.useMutation({
    onSuccess: () => {
      toast.success("Marked as paid");
      void utils.reminders.listDue.invalidate();
      void utils.reminders.status.invalidate();
      void utils.overview.stats.invalidate();
    },
    onError: (e) => toast.error(e.message),
  });

  const markUnpaid = api.reminders.markUnpaid.useMutation({
    onSuccess: () => {
      toast.success("Marked as unpaid");
      void utils.reminders.listDue.invalidate();
      void utils.reminders.status.invalidate();
      void utils.overview.stats.invalidate();
    },
    onError: (e) => toast.error(e.message),
  });

  const statusByDueId = new Map(
    status?.cards.map((c) => [c.dueEntryId, c]) ?? [],
  );

  const unpaid = dues?.filter((d) => !d.paidAt) ?? [];
  const paid = dues?.filter((d) => d.paidAt) ?? [];

  return (
    <div className="space-y-8">
      <DashboardPageHeader
        title="Reminders"
        actions={
          <div className="flex flex-wrap gap-2">
            <Button
              onClick={() => sendNow.mutate({})}
              disabled={sendNow.isPending}
            >
              <Bell className="mr-2 h-4 w-4" />
              Send now
            </Button>
            <Button
              variant="outline"
              onClick={() => sendNow.mutate({ force: true })}
              disabled={sendNow.isPending}
            >
              Force send
            </Button>
          </div>
        }
      />

      {status && (
        <Card className="border-border/80">
          <CardContent className="flex flex-wrap items-center gap-3 py-4 text-sm">
            <span className="text-muted-foreground">Today {status.asOf}</span>
            <StatusBadge
              label={`${status.readyCount} ready`}
              variant={status.readyCount > 0 ? "warning" : "muted"}
            />
            <StatusBadge
              label={inWindowCountLabel(status.inWindowCount)}
              variant="muted"
            />
            <StatusBadge
              label={formatDaysBeforeDue(status.defaultWindowDays)}
              variant="muted"
            />
          </CardContent>
        </Card>
      )}

      {isLoading ? (
        <div className="flex justify-center py-16">
          <LoadingSpinner size="lg" />
        </div>
      ) : !dues?.length ? (
        <EmptyState
          icon={<Bell className="h-6 w-6 text-muted-foreground" />}
          title="No due entries"
          message="Run SOA to populate due dates."
        />
      ) : (
        <div className="space-y-8">
          <section className="space-y-3">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
              Unpaid ({unpaid.length})
            </h2>
            <div className="grid gap-3 md:grid-cols-2">
              {unpaid.map((d) => (
                <DueCard
                  key={d.id}
                  entry={d}
                  reminderStatus={statusByDueId.get(d.id)}
                  onMarkPaid={() => markPaid.mutate({ dueEntryId: d.id })}
                  isPending={markPaid.isPending}
                />
              ))}
              {!unpaid.length && (
                <p className="text-sm text-muted-foreground">All caught up.</p>
              )}
            </div>
          </section>

          {paid.length > 0 && (
            <section className="space-y-3">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                Paid ({paid.length})
              </h2>
              <div className="grid gap-3 md:grid-cols-2">
                {paid.map((d) => (
                  <DueCard
                    key={d.id}
                    entry={d}
                    paid
                    reminderStatus={statusByDueId.get(d.id)}
                    onMarkUnpaid={() => markUnpaid.mutate({ dueEntryId: d.id })}
                    isPending={markUnpaid.isPending}
                  />
                ))}
              </div>
            </section>
          )}
        </div>
      )}
    </div>
  );
}

function DueCard({
  entry,
  paid,
  reminderStatus,
  onMarkPaid,
  onMarkUnpaid,
  isPending,
}: {
  entry: {
    id: string;
    bankLabel: string;
    cardLast4: string;
    dueDate: string;
    dueDateYmd: string;
    minimumDue: string;
    totalDue: string;
    paidAt: Date | null;
  };
  paid?: boolean;
  reminderStatus?: {
    statusLabel: string;
    status: string;
    daysAway: number;
    windowDays: number;
  };
  onMarkPaid?: () => void;
  onMarkUnpaid?: () => void;
  isPending?: boolean;
}) {
  return (
    <Card className={cn(paid && "opacity-80")}>
      <CardHeader className="flex flex-row items-start justify-between pb-2">
        <div>
          <CardTitle className="text-base">
            {entry.bankLabel} · {entry.cardLast4}
          </CardTitle>
          <p className="text-xs text-muted-foreground">Due {entry.dueDate}</p>
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
            className="w-full justify-center py-1"
          />
        )}
        <div className="flex justify-between text-sm">
          <span className="text-muted-foreground">Minimum</span>
          <span className="font-medium">{entry.minimumDue}</span>
        </div>
        <div className="flex justify-between text-sm">
          <span className="text-muted-foreground">Total due</span>
          <span className="font-semibold">{entry.totalDue}</span>
        </div>
        {paid ? (
          <Button
            variant="outline"
            size="sm"
            className="w-full"
            onClick={onMarkUnpaid}
            disabled={isPending}
          >
            <RotateCcw className="mr-2 h-3 w-3" />
            Mark unpaid
          </Button>
        ) : (
          <Button
            size="sm"
            className="w-full"
            onClick={onMarkPaid}
            disabled={isPending}
          >
            <CheckCircle2 className="mr-2 h-3 w-3" />
            Mark paid
          </Button>
        )}
      </CardContent>
    </Card>
  );
}
