"use client";

import { useMemo, useRef, useState, type ChangeEvent } from "react";
import { toast } from "sonner";

import type { ReceiptUploadOptions } from "@/components/shared/ReceiptUploadProgressDialog";
import { api } from "@/lib/api/client";
import type { ReceiptUploadSettled } from "@/hooks/use-receipt-upload-progress";
import { AI_SKIP_NO_KEYS_MESSAGE } from "@/lib/receipts/ai-skip";

export function useReceiptUploadFlow(connected: Set<string>) {
  const utils = api.useUtils();
  const fileRef = useRef<HTMLInputElement>(null);
  const pendingDueEntryIdRef = useRef<string | null>(null);

  const [progressOpen, setProgressOpen] = useState(false);
  const [activeProcessId, setActiveProcessId] = useState<string | null>(null);
  const [uploadSettled, setUploadSettled] =
    useState<ReceiptUploadSettled>(null);
  const [uploadErrorMessage, setUploadErrorMessage] = useState<string | null>(
    null,
  );
  const [isUploading, setIsUploading] = useState(false);

  const uploadOptions = useMemo(
    (): ReceiptUploadOptions => ({
      markPaid: true,
      updateCalendar:
        connected.has("gmail") || connected.has("google_calendar"),
    }),
    [connected],
  );

  const validateAndMarkPaid = api.receipts.validateAndMarkPaid.useMutation({
    onSuccess: (result) => {
      if (result.payment.ok) {
        setUploadSettled("success");
        toast.success(
          `Payment confirmed — •••• ${result.receipt.parsedCardLast4 ?? "????"}`,
        );
      } else if (result.payment.code === "ai_skipped_no_keys") {
        setUploadSettled("success");
        toast.error(AI_SKIP_NO_KEYS_MESSAGE);
      } else if (result.payment.code === "validate_only") {
        setUploadSettled("success");
        toast.message("Receipt validated");
      } else if (result.payment.code === "ai_error") {
        setUploadErrorMessage(result.payment.reason);
        setUploadSettled("error");
        toast.error("AI validation unavailable", {
          description: result.payment.reason,
        });
      } else {
        setUploadErrorMessage(result.payment.reason);
        setUploadSettled("error");
        toast.error(result.payment.reason);
      }
      void utils.receipts.list.invalidate();
      void utils.reminders.listDue.invalidate();
      void utils.reminders.status.invalidate();
      void utils.overview.stats.invalidate();
      setIsUploading(false);
    },
    onError: (e) => {
      setUploadErrorMessage(e.message);
      setUploadSettled("error");
      toast.error(e.message);
      setIsUploading(false);
    },
  });

  async function uploadFile(file: File, dueEntryId?: string) {
    const processId = crypto.randomUUID();
    setActiveProcessId(processId);
    setUploadSettled(null);
    setUploadErrorMessage(null);
    setProgressOpen(true);
    setIsUploading(true);

    const form = new FormData();
    form.append("file", file);
    form.append("processId", processId);
    form.append("markPaid", "true");
    form.append(
      "updateCalendar",
      uploadOptions.updateCalendar ? "true" : "false",
    );

    try {
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
      validateAndMarkPaid.mutate({
        storagePath,
        originalFileName: file.name,
        markPaid: true,
        processId,
        ...(dueEntryId ? { dueEntryId } : {}),
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Upload failed";
      setUploadErrorMessage(message);
      setUploadSettled("error");
      toast.error(message);
      setIsUploading(false);
    }
  }

  function triggerFilePicker(dueEntryId?: string) {
    pendingDueEntryIdRef.current = dueEntryId ?? null;
    fileRef.current?.click();
  }

  function handleFileInputChange(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    const dueEntryId = pendingDueEntryIdRef.current ?? undefined;
    pendingDueEntryIdRef.current = null;
    if (file) {
      void uploadFile(file, dueEntryId);
    }
    event.target.value = "";
  }

  function handleProgressComplete() {
    setProgressOpen(false);
    setActiveProcessId(null);
    setUploadSettled(null);
    setUploadErrorMessage(null);
  }

  function handleProgressOpenChange(open: boolean) {
    const isPending = isUploading || validateAndMarkPaid.isPending;
    if (!open && isPending) return;
    if (!open && uploadSettled === "success") return;
    if (!open) {
      handleProgressComplete();
    } else {
      setProgressOpen(open);
    }
  }

  const isPending = isUploading || validateAndMarkPaid.isPending;

  return {
    fileRef,
    progressOpen,
    activeProcessId,
    uploadOptions,
    uploadSettled,
    uploadErrorMessage,
    isPending,
    handleProgressComplete,
    handleProgressOpenChange,
    triggerFilePicker,
    handleFileInputChange,
    uploadFile,
  };
}
