"use client";

import { useEffect, useMemo, useState } from "react";
import { Bell } from "lucide-react";
import { toast } from "sonner";

import { ConfirmDialog } from "@/components/shared/ConfirmDialog";
import { DashboardSection } from "@/components/shared/DashboardSection";
import { EmptyState } from "@/components/shared/EmptyState";
import { ReceiptUploadProgressDialog } from "@/components/shared/ReceiptUploadProgressDialog";
import { RemindersContentSkeleton } from "@/components/shared/skeletons";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { Card, CardContent } from "@/components/ui/card";
import { api } from "@/lib/api/client";
import type { DueActionType } from "@/lib/due-action-progress";
import { useReceiptUploadFlow } from "@/hooks/use-receipt-upload-flow";
import { dueMonthPaidSummary } from "@/lib/soa/due-month";
import {
  formatDaysBeforeDue,
  inWindowCountLabel,
} from "@/lib/reminders/reminder-labels";

import {
  DueActionProgressDialog,
  type DueActionSettled,
} from "./DueActionProgressDialog";
import { DueEntryCard } from "./DueEntryCard";
import { MarkPaidChoiceDialog } from "./MarkPaidChoiceDialog";
import { ReminderGroupHeader } from "./ReminderGroupHeader";
import { ReminderGroupToggle } from "./ReminderGroupToggle";
import {
  formatDueCardTitle,
  groupDueEntries,
  type DueEntryListItem,
  type ReminderGroupMode,
} from "../lib/reminder-utils";

const GROUP_MODE_KEY = "kame-ops:reminders-group-mode";

export function ReminderDueEntriesPanel() {
  const utils = api.useUtils();
  const [groupMode, setGroupMode] = useState<ReminderGroupMode>("month");
  const [progressOpen, setProgressOpen] = useState(false);
  const [activeProcessId, setActiveProcessId] = useState<string | null>(null);
  const [activeAction, setActiveAction] = useState<DueActionType>("mark_paid");
  const [actionSettled, setActionSettled] = useState<DueActionSettled>(null);
  const [actionErrorMessage, setActionErrorMessage] = useState<string | null>(
    null,
  );
  const [isActionPending, setIsActionPending] = useState(false);
  const [confirmUnpaidEntry, setConfirmUnpaidEntry] =
    useState<DueEntryListItem | null>(null);
  const [markPaidChoiceEntry, setMarkPaidChoiceEntry] =
    useState<DueEntryListItem | null>(null);

  useEffect(() => {
    const stored = localStorage.getItem(GROUP_MODE_KEY);
    if (stored === "month" || stored === "card") {
      setGroupMode(stored);
    }
  }, []);

  function handleGroupModeChange(mode: ReminderGroupMode) {
    setGroupMode(mode);
    localStorage.setItem(GROUP_MODE_KEY, mode);
  }

  const { data: dues, isLoading } = api.reminders.listDue.useQuery({
    unpaidOnly: false,
  });
  const { data: status } = api.reminders.status.useQuery();
  const { data: integrations } = api.integrations.list.useQuery();

  const connected = useMemo(
    () => new Set(integrations?.map((i) => i.provider) ?? []),
    [integrations],
  );

  const receiptUpload = useReceiptUploadFlow(connected);

  const dueItems = (dues ?? []) as DueEntryListItem[];
  const dueForPaidSummary = useMemo(
    () =>
      dueItems.map((due) => ({
        statementPeriodKey: due.statementPeriodKey,
        paidAt: due.paidAt,
      })),
    [dueItems],
  );
  const groups = useMemo(
    () => groupDueEntries(dueItems, groupMode),
    [dueItems, groupMode],
  );

  const statusByDueId = useMemo(
    () => new Map(status?.cards.map((c) => [c.dueEntryId, c]) ?? []),
    [status?.cards],
  );

  const unpaidCount = dueItems.filter((d) => !d.paidAt).length;

  const markPaid = api.reminders.markPaid.useMutation({
    onSuccess: () => {
      setActionSettled("success");
      toast.success("Marked as paid");
      void utils.reminders.listDue.invalidate();
      void utils.reminders.status.invalidate();
      void utils.overview.stats.invalidate();
      setIsActionPending(false);
    },
    onError: (e) => {
      setActionErrorMessage(e.message);
      setActionSettled("error");
      toast.error(e.message);
      setIsActionPending(false);
    },
  });

  const markUnpaid = api.reminders.markUnpaid.useMutation({
    onSuccess: () => {
      setActionSettled("success");
      toast.success("Marked as unpaid");
      void utils.reminders.listDue.invalidate();
      void utils.reminders.status.invalidate();
      void utils.receipts.list.invalidate();
      void utils.overview.stats.invalidate();
      setIsActionPending(false);
    },
    onError: (e) => {
      setActionErrorMessage(e.message);
      setActionSettled("error");
      toast.error(e.message);
      setIsActionPending(false);
    },
  });

  function startDueAction(dueEntryId: string, action: DueActionType) {
    const processId = crypto.randomUUID();
    setActiveProcessId(processId);
    setActiveAction(action);
    setActionSettled(null);
    setActionErrorMessage(null);
    setProgressOpen(true);
    setIsActionPending(true);

    if (action === "mark_paid") {
      markPaid.mutate({ dueEntryId, processId });
    } else {
      markUnpaid.mutate({ dueEntryId, processId });
    }
  }

  function handleProgressComplete() {
    setProgressOpen(false);
    setActiveProcessId(null);
    setActionSettled(null);
    setActionErrorMessage(null);
  }

  function handleProgressOpenChange(open: boolean) {
    if (!open && isActionPending) return;
    if (!open && actionSettled === "success") return;
    if (!open) {
      handleProgressComplete();
    } else {
      setProgressOpen(open);
    }
  }

  function handleUploadReceiptChoice() {
    if (!markPaidChoiceEntry) return;
    const dueEntryId = markPaidChoiceEntry.id;
    setMarkPaidChoiceEntry(null);
    receiptUpload.triggerFilePicker(dueEntryId);
  }

  function handleMarkWithoutReceipt() {
    if (!markPaidChoiceEntry) return;
    const dueEntryId = markPaidChoiceEntry.id;
    setMarkPaidChoiceEntry(null);
    startDueAction(dueEntryId, "mark_paid");
  }

  const actionPending =
    isActionPending ||
    markPaid.isPending ||
    markUnpaid.isPending ||
    receiptUpload.isPending;

  return (
    <DashboardSection title="Due dates">
      <input
        ref={receiptUpload.fileRef}
        type="file"
        accept="image/*,application/pdf"
        className="hidden"
        onChange={receiptUpload.handleFileInputChange}
      />

      <DueActionProgressDialog
        open={progressOpen}
        onOpenChange={handleProgressOpenChange}
        processId={activeProcessId}
        action={activeAction}
        isPending={actionPending}
        settled={actionSettled}
        errorMessage={actionErrorMessage}
        onComplete={handleProgressComplete}
      />

      <ConfirmDialog
        open={confirmUnpaidEntry !== null}
        onOpenChange={(open) => {
          if (!open) setConfirmUnpaidEntry(null);
        }}
        title="Mark as unpaid?"
        description={
          confirmUnpaidEntry
            ? `${formatDueCardTitle(confirmUnpaidEntry)} will show as unpaid. Reminders may resume.`
            : ""
        }
        confirmLabel="Mark unpaid"
        onConfirm={() => {
          if (!confirmUnpaidEntry) return;
          const dueEntryId = confirmUnpaidEntry.id;
          setConfirmUnpaidEntry(null);
          startDueAction(dueEntryId, "mark_unpaid");
        }}
      />

      <MarkPaidChoiceDialog
        open={markPaidChoiceEntry !== null}
        onOpenChange={(open) => {
          if (!open) setMarkPaidChoiceEntry(null);
        }}
        entry={markPaidChoiceEntry}
        onUploadReceipt={handleUploadReceiptChoice}
        onMarkWithoutReceipt={handleMarkWithoutReceipt}
        disabled={actionPending}
      />

      <ReceiptUploadProgressDialog
        open={receiptUpload.progressOpen}
        onOpenChange={receiptUpload.handleProgressOpenChange}
        processId={receiptUpload.activeProcessId}
        options={receiptUpload.uploadOptions}
        isPending={receiptUpload.isPending}
        settled={receiptUpload.uploadSettled}
        errorMessage={receiptUpload.uploadErrorMessage}
        onComplete={receiptUpload.handleProgressComplete}
      />

      {status && !isLoading && dueItems.length > 0 && (
        <Card className="border-border/80 shadow-card">
          <CardContent className="flex flex-col gap-4 p-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0 space-y-2">
              <p className="font-display text-lg font-semibold leading-none">
                <span className="tabular-nums">{dueItems.length}</span>{" "}
                {dueItems.length === 1 ? "entry" : "entries"}
                {unpaidCount > 0 && (
                  <span className="text-base font-medium text-muted-foreground">
                    {" "}
                    ·{" "}
                    <span className="tabular-nums text-foreground">
                      {unpaidCount}
                    </span>{" "}
                    unpaid
                  </span>
                )}
              </p>
              <div className="flex flex-wrap items-center gap-2 text-sm">
                <span className="text-muted-foreground">
                  Today {status.asOf}
                </span>
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
              </div>
            </div>
            <ReminderGroupToggle
              value={groupMode}
              onChange={handleGroupModeChange}
              className="w-full shrink-0 sm:w-auto"
            />
          </CardContent>
        </Card>
      )}

      {isLoading ? (
        <RemindersContentSkeleton />
      ) : !dueItems.length ? (
        <EmptyState
          icon={<Bell className="h-6 w-6 text-muted-foreground" />}
          title="No due entries"
          message="Run SOA to populate due dates."
        />
      ) : (
        <Card className="border-border/80 shadow-card">
          <CardContent className="space-y-8 p-4 sm:p-5">
            {groups.map((group) => (
              <div key={group.key} className="space-y-4">
                <ReminderGroupHeader
                  label={group.label}
                  showPaidSummary={groupMode === "month"}
                  paidSummary={
                    groupMode === "month"
                      ? dueMonthPaidSummary(dueForPaidSummary, group.key)
                      : undefined
                  }
                />
                <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                  {group.items.map((entry) => (
                    <DueEntryCard
                      key={entry.id}
                      entry={entry}
                      reminderStatus={statusByDueId.get(entry.id)}
                      showCardMeta={groupMode !== "card"}
                      disabled={actionPending}
                      onMarkPaid={() => setMarkPaidChoiceEntry(entry)}
                      onMarkUnpaid={() => setConfirmUnpaidEntry(entry)}
                    />
                  ))}
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}
    </DashboardSection>
  );
}
