"use client";

import { useMemo, useRef, useState, type ChangeEvent } from "react";
import { toast } from "sonner";

import type {
  CardUploadJob,
  ReceiptUploadOptions,
} from "@/components/shared/ReceiptBatchUploadProgressDialog";
import { api } from "@/lib/api/client";
import { AI_SKIP_NO_KEYS_MESSAGE } from "@/lib/receipts/ai-skip";

function summarizeGroupResults(
  receipts: Array<{
    payment:
      | { ok: true; thresholdMet?: boolean; paymentSequenceLabel?: string }
      | { ok: false; code?: string; reason?: string };
    receipt: { parsedCardLast4?: string | null };
  }>,
): { settled: "success" | "error"; errorMessage: string | null } {
  const hardFailure = receipts.find(
    (row) =>
      !row.payment.ok &&
      row.payment.code !== "ai_skipped_no_keys" &&
      row.payment.code !== "validate_only",
  );

  if (hardFailure && !hardFailure.payment.ok) {
    return {
      settled: "error",
      errorMessage: hardFailure.payment.reason ?? "Upload failed",
    };
  }

  return { settled: "success", errorMessage: null };
}

export function useReceiptUploadFlow(connected: Set<string>) {
  const utils = api.useUtils();
  const fileRef = useRef<HTMLInputElement>(null);
  const pendingDueEntryIdRef = useRef<string | null>(null);

  const [progressOpen, setProgressOpen] = useState(false);
  const [cardJobs, setCardJobs] = useState<CardUploadJob[]>([]);
  const [analyzingLabel, setAnalyzingLabel] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);

  const uploadOptions = useMemo(
    (): ReceiptUploadOptions => ({
      markPaid: true,
      updateCalendar:
        connected.has("gmail") || connected.has("google_calendar"),
    }),
    [connected],
  );

  const analyzeUploadBatch = api.receipts.analyzeUploadBatch.useMutation();
  const processUploadBatch = api.receipts.processUploadBatch.useMutation();

  async function uploadRawFile(file: File) {
    const form = new FormData();
    form.append("file", file);
    form.append("markPaid", "true");
    form.append(
      "updateCalendar",
      uploadOptions.updateCalendar ? "true" : "false",
    );

    const res = await fetch("/api/receipts/upload", {
      method: "POST",
      body: form,
    });
    if (!res.ok) {
      const body = (await res.json().catch(() => null)) as {
        error?: string;
      } | null;
      throw new Error(body?.error ?? "Upload failed");
    }

    const { storagePath } = (await res.json()) as { storagePath: string };
    return {
      storagePath,
      originalFileName: file.name,
    };
  }

  async function uploadFiles(files: File[], dueEntryId?: string) {
    if (files.length === 0) return;

    setProgressOpen(true);
    setCardJobs([]);
    setAnalyzingLabel(null);
    setIsUploading(true);

    try {
      const uploadedItems = [];
      for (const file of files) {
        uploadedItems.push(await uploadRawFile(file));
      }

      if (files.length === 1 && !dueEntryId) {
        const processId = crypto.randomUUID();
        setCardJobs([
          {
            processId,
            cardLabel: "Receipt",
            receiptCount: 1,
            settled: null,
            errorMessage: null,
          },
        ]);

        const analysis = await analyzeUploadBatch.mutateAsync({
          items: uploadedItems,
        });
        const group = analysis.groups[0];
        if (!group) {
          throw new Error("Could not analyze receipt");
        }

        setCardJobs([
          {
            processId,
            cardLabel: group.label,
            receiptCount: group.items.length,
            settled: null,
            errorMessage: null,
          },
        ]);

        const result = await processUploadBatch.mutateAsync({
          groups: [
            {
              processId,
              cardLabel: group.label,
              items: group.items,
            },
          ],
          markPaid: true,
          updateCalendar: uploadOptions.updateCalendar,
        });

        const summary = summarizeGroupResults(result.groups[0]?.receipts ?? []);
        setCardJobs([
          {
            processId,
            cardLabel: group.label,
            receiptCount: group.items.length,
            settled: summary.settled,
            errorMessage: summary.errorMessage,
          },
        ]);

        if (summary.settled === "success") {
          const payment = result.groups[0]?.receipts[0]?.payment;
          if (payment?.ok && payment.thresholdMet) {
            toast.success(
              `Payment confirmed — •••• ${result.groups[0]?.receipts[0]?.receipt.parsedCardLast4 ?? "????"}`,
            );
          } else if (payment?.ok && !payment.thresholdMet) {
            toast.success(
              `Partial payment ${payment.paymentSequenceLabel ?? ""} saved`.trim(),
            );
          } else if (payment && !payment.ok && payment.code === "ai_skipped_no_keys") {
            toast.error(AI_SKIP_NO_KEYS_MESSAGE);
          }
        } else if (summary.errorMessage) {
          toast.error(summary.errorMessage);
        }
      } else {
        setAnalyzingLabel(`Analyzing ${files.length} receipts…`);

        const analysis = await analyzeUploadBatch.mutateAsync({
          items: uploadedItems,
          dueEntryId,
        });

        const jobs: CardUploadJob[] = analysis.groups.map((group) => ({
          processId: crypto.randomUUID(),
          cardLabel: group.label,
          receiptCount: group.items.length,
          settled: null,
          errorMessage: null,
        }));

        setAnalyzingLabel(null);
        setCardJobs(jobs);

        const result = await processUploadBatch.mutateAsync({
          groups: analysis.groups.map((group, index) => ({
            processId: jobs[index]!.processId,
            cardLabel: group.label,
            items: group.items,
          })),
          dueEntryId,
          markPaid: true,
          updateCalendar: uploadOptions.updateCalendar,
        });

        setCardJobs(
          jobs.map((job, index) => {
            const summary = summarizeGroupResults(
              result.groups[index]?.receipts ?? [],
            );
            return {
              ...job,
              settled: summary.settled,
              errorMessage: summary.errorMessage,
            };
          }),
        );

        const successGroups = result.groups.filter((group) =>
          group.receipts.every(
            (row) =>
              row.payment.ok ||
              row.payment.code === "ai_skipped_no_keys" ||
              row.payment.code === "validate_only",
          ),
        );

        if (successGroups.length > 0) {
          toast.success(
            successGroups.length === 1
              ? `${successGroups[0]!.cardLabel} — ${successGroups[0]!.receiptCount} receipt(s) processed`
              : `${successGroups.length} cards processed`,
          );
        }

        const failed = result.groups.find((group) =>
          group.receipts.some(
            (row) =>
              !row.payment.ok &&
              row.payment.code !== "ai_skipped_no_keys" &&
              row.payment.code !== "validate_only",
          ),
        );
        if (failed) {
          const reason = failed.receipts.find((row) => !row.payment.ok);
          toast.error(
            reason && !reason.payment.ok
              ? reason.payment.reason
              : "Some receipts failed",
          );
        }
      }

      void utils.receipts.list.invalidate();
      void utils.reminders.listDue.invalidate();
      void utils.reminders.status.invalidate();
      void utils.overview.stats.invalidate();
    } catch (error) {
      const message = error instanceof Error ? error.message : "Upload failed";
      setCardJobs((prev) =>
        prev.length > 0
          ? prev.map((job) => ({
              ...job,
              settled: "error" as const,
              errorMessage: message,
            }))
          : [
              {
                processId: crypto.randomUUID(),
                cardLabel: "Receipt",
                receiptCount: 1,
                settled: "error" as const,
                errorMessage: message,
              },
            ],
      );
      toast.error(message);
    } finally {
      setAnalyzingLabel(null);
      setIsUploading(false);
    }
  }

  function triggerFilePicker(dueEntryId?: string) {
    pendingDueEntryIdRef.current = dueEntryId ?? null;
    fileRef.current?.click();
  }

  function handleFileInputChange(event: ChangeEvent<HTMLInputElement>) {
    const fileList = event.target.files;
    const dueEntryId = pendingDueEntryIdRef.current ?? undefined;
    pendingDueEntryIdRef.current = null;
    if (fileList?.length) {
      void uploadFiles([...fileList], dueEntryId);
    }
    event.target.value = "";
  }

  function handleProgressComplete() {
    setProgressOpen(false);
    setCardJobs([]);
    setAnalyzingLabel(null);
  }

  function handleProgressOpenChange(open: boolean) {
    const isPending =
      isUploading ||
      analyzeUploadBatch.isPending ||
      processUploadBatch.isPending;
    const allSucceeded =
      cardJobs.length > 0 && cardJobs.every((job) => job.settled === "success");

    if (!open && isPending) return;
    if (!open && allSucceeded && progressOpen) return;
    if (!open) {
      handleProgressComplete();
    } else {
      setProgressOpen(open);
    }
  }

  const isPending =
    isUploading ||
    analyzeUploadBatch.isPending ||
    processUploadBatch.isPending;

  return {
    fileRef,
    progressOpen,
    cardJobs,
    analyzingLabel,
    uploadOptions,
    isPending,
    handleProgressComplete,
    handleProgressOpenChange,
    triggerFilePicker,
    handleFileInputChange,
    uploadFiles,
  };
}
