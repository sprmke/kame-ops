"use client";

import { useEffect, useMemo, useState } from "react";
import { Receipt, Upload } from "lucide-react";
import { toast } from "sonner";

import { ConfirmDialog } from "@/components/shared/ConfirmDialog";
import { DashboardPageHeader } from "@/components/shared/DashboardPageHeader";
import { EmptyState } from "@/components/shared/EmptyState";
import { ReceiptsContentSkeleton } from "@/components/shared/skeletons";
import { Button } from "@/components/ui/button";
import {
  AI_SKIP_NO_KEYS_MESSAGE,
  isReceiptAiSkippedNoKeys,
} from "@/lib/receipts/ai-skip";
import { api } from "@/lib/api/client";
import { useReceiptUploadFlow } from "@/hooks/use-receipt-upload-flow";
import {
  dedupeReceiptsForDisplay,
  groupReceipts,
  mergeReceiptFromRevalidation,
  receiptGroupPaidSummary,
  type ReceiptGroupMode,
  type ReceiptListItem,
  type ReceiptMonthDueContext,
} from "../lib/receipt-utils";

import { ReceiptCard } from "./ReceiptCard";
import { ReceiptGroupHeader } from "./ReceiptGroupHeader";
import { ReceiptGroupToggle } from "./ReceiptGroupToggle";
import { ReceiptPreviewDialog } from "./ReceiptPreviewDialog";
import { ReceiptBatchUploadProgressDialog } from "@/components/shared/ReceiptBatchUploadProgressDialog";

const GROUP_MODE_KEY = "kame-ops:receipts-group-mode";

export function ReceiptsPage() {
  const [groupMode, setGroupMode] = useState<ReceiptGroupMode>("month");
  const [previewReceipt, setPreviewReceipt] = useState<ReceiptListItem | null>(
    null,
  );
  const [deleteReceipt, setDeleteReceipt] = useState<ReceiptListItem | null>(
    null,
  );
  const utils = api.useUtils();

  useEffect(() => {
    const stored = localStorage.getItem(GROUP_MODE_KEY);
    if (stored === "month" || stored === "card") {
      setGroupMode(stored);
    }
  }, []);

  function handleGroupModeChange(mode: ReceiptGroupMode) {
    setGroupMode(mode);
    localStorage.setItem(GROUP_MODE_KEY, mode);
  }

  const { data: receipts, isLoading } = api.receipts.list.useQuery();
  const { data: dues } = api.reminders.listDue.useQuery({ unpaidOnly: false });
  const { data: integrations } = api.integrations.list.useQuery();

  const connected = useMemo(
    () => new Set(integrations?.map((i) => i.provider) ?? []),
    [integrations],
  );

  const receiptUpload = useReceiptUploadFlow(connected);

  const receiptItems = (receipts ?? []) as ReceiptListItem[];

  const dueForGrouping = useMemo((): ReceiptMonthDueContext[] => {
    return (dues ?? []).map((due) => ({
      id: due.id,
      issuerId: due.issuerId,
      cardLast4: due.cardLast4,
      dueDateYmd: due.dueDateYmd,
      statementPeriodKey: due.statementPeriodKey,
      statementPeriodLabel: due.statementPeriodLabel,
    }));
  }, [dues]);

  const visibleReceipts = useMemo(
    () => dedupeReceiptsForDisplay(receiptItems, dueForGrouping),
    [receiptItems, dueForGrouping],
  );

  const groups = useMemo(
    () => groupReceipts(visibleReceipts, groupMode, dueForGrouping),
    [visibleReceipts, groupMode, dueForGrouping],
  );

  const confirmMarkPaid = api.receipts.confirmMarkPaid.useMutation({
    onSuccess: () => {
      toast.success("Marked paid");
      void utils.receipts.list.invalidate();
      void utils.reminders.listDue.invalidate();
      void utils.overview.stats.invalidate();
    },
    onError: (e) => toast.error(e.message),
  });

  const revalidateWithAi = api.receipts.revalidateWithAi.useMutation({
    onSuccess: (result, variables) => {
      if (isReceiptAiSkippedNoKeys(result.ai)) {
        toast.error(AI_SKIP_NO_KEYS_MESSAGE);
        return;
      }

      if (result.ai.verdict === "skipped") {
        toast.message("AI validation skipped", {
          description: result.ai.summary,
        });
        return;
      }

      if (result.ai.aiModelError) {
        toast.error("AI validation unavailable", {
          description: result.ai.aiModelError,
        });
      } else {
        toast.success("Receipt re-validated");
      }

      setPreviewReceipt((prev) => {
        if (!prev || prev.id !== variables.receiptId) return prev;
        return mergeReceiptFromRevalidation(prev, result.receipt);
      });

      utils.receipts.list.setData(undefined, (old) => {
        if (!old) return old;
        return old.map((row) =>
          row.id === variables.receiptId
            ? mergeReceiptFromRevalidation(row, result.receipt)
            : row,
        );
      });

      void utils.receipts.list.invalidate();
      void utils.overview.stats.invalidate();
    },
    onError: (e) => toast.error(e.message),
  });

  function handleRevalidate(receiptId: string) {
    revalidateWithAi.mutate({ receiptId });
  }

  const deleteReceiptMutation = api.receipts.delete.useMutation({
    onSuccess: () => {
      toast.success("Receipt removed");
      setDeleteReceipt(null);
      void utils.receipts.list.invalidate();
      void utils.overview.stats.invalidate();
    },
    onError: (e) => toast.error(e.message),
  });

  return (
    <div className="space-y-8">
      <DashboardPageHeader
        title="Receipts"
        actions={
          <>
            <input
              ref={receiptUpload.fileRef}
              type="file"
              accept="image/*,application/pdf"
              multiple
              className="hidden"
              onChange={receiptUpload.handleFileInputChange}
            />
            <Button
              onClick={() => receiptUpload.triggerFilePicker()}
              disabled={receiptUpload.isPending}
            >
              <Upload className="mr-2 h-4 w-4" />
              Upload receipt
            </Button>
          </>
        }
      />

      <ReceiptBatchUploadProgressDialog
        open={receiptUpload.progressOpen}
        onOpenChange={receiptUpload.handleProgressOpenChange}
        jobs={receiptUpload.cardJobs}
        options={receiptUpload.uploadOptions}
        isPending={receiptUpload.isPending}
        batchProgress={receiptUpload.batchProgress}
        onComplete={receiptUpload.handleProgressComplete}
      />

      <ReceiptPreviewDialog
        open={previewReceipt !== null}
        onOpenChange={(open) => {
          if (!open) setPreviewReceipt(null);
        }}
        receipt={previewReceipt}
        onDelete={setDeleteReceipt}
        onMarkPaid={(receiptId) => confirmMarkPaid.mutate({ receiptId })}
        isMarkPaidPending={confirmMarkPaid.isPending}
        onRevalidate={handleRevalidate}
        isRevalidatePending={revalidateWithAi.isPending}
      />

      <ConfirmDialog
        open={deleteReceipt !== null}
        onOpenChange={(open) => {
          if (!open) setDeleteReceipt(null);
        }}
        title="Remove receipt?"
        description="This deletes the uploaded file. Paid status on the due entry is kept."
        confirmLabel="Remove"
        variant="destructive"
        isLoading={deleteReceiptMutation.isPending}
        onConfirm={() => {
          if (deleteReceipt) {
            deleteReceiptMutation.mutate({ receiptId: deleteReceipt.id });
          }
        }}
      />

      {isLoading ? (
        <ReceiptsContentSkeleton />
      ) : !visibleReceipts.length ? (
        <EmptyState
          icon={<Receipt className="h-6 w-6 text-muted-foreground" />}
          title="No receipts"
          message="Upload a payment screenshot to validate and mark SOA paid."
        />
      ) : (
        <div className="space-y-6">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm text-muted-foreground">
              <span className="font-medium text-foreground tabular-nums">
                {visibleReceipts.length}
              </span>{" "}
              {visibleReceipts.length === 1 ? "receipt" : "receipts"}
            </p>
            <ReceiptGroupToggle
              value={groupMode}
              onChange={handleGroupModeChange}
              className="w-full sm:w-auto"
            />
          </div>

          {groups.map((group) => (
            <section key={group.key} className="space-y-4">
              <ReceiptGroupHeader
                label={group.label}
                showPaidSummary={groupMode === "month"}
                paidSummary={
                  groupMode === "month"
                    ? receiptGroupPaidSummary(group.items)
                    : undefined
                }
              />
              <div className="grid gap-3 md:grid-cols-2">
                {group.items.map((receipt) => (
                  <ReceiptCard
                    key={receipt.id}
                    receipt={receipt}
                    onView={setPreviewReceipt}
                    onDelete={setDeleteReceipt}
                    onRevalidate={(item) => handleRevalidate(item.id)}
                    isRevalidatePending={
                      revalidateWithAi.isPending &&
                      revalidateWithAi.variables?.receiptId === receipt.id
                    }
                  />
                ))}
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
