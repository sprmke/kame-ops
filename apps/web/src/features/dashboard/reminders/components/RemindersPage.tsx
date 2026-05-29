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
import { cn } from "@/lib/utils/cn";

export function RemindersPage() {
  const utils = api.useUtils();
  const { data: dues, isLoading } = api.reminders.listDue.useQuery({
    unpaidOnly: false,
  });

  const sendNow = api.reminders.sendNow.useMutation({
    onSuccess: (r) => toast.success(`Sent ${r.sent} reminder(s)`),
    onError: (e) => toast.error(e.message),
  });

  const markPaid = api.reminders.markPaid.useMutation({
    onSuccess: () => {
      toast.success("Marked as paid");
      void utils.reminders.listDue.invalidate();
      void utils.overview.stats.invalidate();
    },
    onError: (e) => toast.error(e.message),
  });

  const markUnpaid = api.reminders.markUnpaid.useMutation({
    onSuccess: () => {
      toast.success("Marked as unpaid — reminders will resume");
      void utils.reminders.listDue.invalidate();
      void utils.overview.stats.invalidate();
    },
    onError: (e) => toast.error(e.message),
  });

  const unpaid = dues?.filter((d) => !d.paidAt) ?? [];
  const paid = dues?.filter((d) => d.paidAt) ?? [];

  return (
    <div className="space-y-8">
      <DashboardPageHeader
        title="Reminders"
        description="Due-date notification window (D-4 through D-0). Mark cards paid to stop pings and update calendar."
        actions={
          <Button onClick={() => sendNow.mutate()} disabled={sendNow.isPending}>
            <Bell className="mr-2 h-4 w-4" />
            Send reminders now
          </Button>
        }
      />

      {isLoading ? (
        <div className="flex justify-center py-16">
          <LoadingSpinner size="lg" />
        </div>
      ) : !dues?.length ? (
        <EmptyState
          icon={<Bell className="h-6 w-6 text-muted-foreground" />}
          title="No due entries"
          message="Run an SOA pipeline first to populate due dates from your statements."
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
                  onMarkPaid={() => markPaid.mutate({ dueEntryId: d.id })}
                  isPending={markPaid.isPending}
                />
              ))}
              {!unpaid.length && (
                <p className="text-sm text-muted-foreground">
                  All caught up — no unpaid dues.
                </p>
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
