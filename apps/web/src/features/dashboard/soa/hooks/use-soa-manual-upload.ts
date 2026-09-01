"use client";

import { useRef, useState } from "react";
import { toast } from "sonner";

import { api } from "@/lib/api/client";
import { formatUserFacingErrorMessage } from "@/lib/errors/user-facing-message";
import { manualSoaSavedMessage } from "@/lib/utils/toast-messages";

export type ManualSoaConfirmPending = {
  fileName: string;
  reason: "out_of_range" | "unknown_month";
  detected: { month: number; year: number } | null;
  periodMonths: { month: number; year: number }[];
  periodLabel: string;
  preview: {
    issuerId: string;
    bankLabel: string;
    cardLast4: string;
    statementDate: string;
    dueDate: string;
    minimumDue: string;
    totalDue: string;
    transactionCount: number;
    month: number | null;
    year: number | null;
    usedAi: boolean;
  };
  storagePath: string;
  mimeType?: string;
};

type ConfirmDecision =
  | { action: "skip" }
  | { action: "force"; month: number; year: number }
  | { action: "outOfRange" };

export function useSoaManualUpload(periodId: string, onSaved: () => void) {
  const fileRef = useRef<HTMLInputElement>(null);
  const processUpload = api.soa.processManualUpload.useMutation();
  const [isPending, setIsPending] = useState(false);
  const [progressLabel, setProgressLabel] = useState<string | null>(null);
  const [confirmPending, setConfirmPending] =
    useState<ManualSoaConfirmPending | null>(null);
  const confirmResolver = useRef<((decision: ConfirmDecision) => void) | null>(
    null,
  );

  function triggerFilePicker() {
    fileRef.current?.click();
  }

  function resolveConfirm(decision: ConfirmDecision) {
    confirmResolver.current?.(decision);
    confirmResolver.current = null;
    setConfirmPending(null);
  }

  function waitForConfirm(
    pending: ManualSoaConfirmPending,
  ): Promise<ConfirmDecision> {
    setConfirmPending(pending);
    return new Promise((resolve) => {
      confirmResolver.current = resolve;
    });
  }

  async function processItem(
    storagePath: string,
    originalFileName: string,
    mimeType: string | undefined,
    extra?: {
      forceMonth?: number;
      forceYear?: number;
      allowOutOfRange?: boolean;
    },
  ) {
    return processUpload.mutateAsync({
      periodId,
      storagePath,
      originalFileName,
      mimeType,
      ...extra,
    });
  }

  async function uploadFiles(files: File[]) {
    if (!files.length || isPending) return;
    setIsPending(true);
    let saved = 0;
    let updated = 0;

    try {
      for (const [index, file] of files.entries()) {
        setProgressLabel(`${index + 1} of ${files.length}`);
        const form = new FormData();
        form.set("file", file);
        const res = await fetch("/api/soa/manual-upload", {
          method: "POST",
          body: form,
        });
        const body = (await res.json()) as {
          storagePath?: string;
          originalFileName?: string;
          mimeType?: string;
          error?: string;
        };
        if (!res.ok || !body.storagePath) {
          toast.error(
            formatUserFacingErrorMessage(body.error ?? "Upload failed"),
          );
          continue;
        }

        let result = await processItem(
          body.storagePath,
          body.originalFileName ?? file.name,
          body.mimeType ?? file.type,
        );

        if (result.status === "needs_confirmation") {
          const decision = await waitForConfirm({
            fileName: result.fileName,
            reason: result.reason,
            detected: result.detected,
            periodMonths: result.periodMonths,
            periodLabel: result.periodLabel,
            preview: result.preview,
            storagePath: body.storagePath,
            mimeType: body.mimeType ?? file.type,
          });
          if (decision.action === "skip") continue;
          result = await processItem(
            body.storagePath,
            body.originalFileName ?? file.name,
            body.mimeType ?? file.type,
            decision.action === "force"
              ? { forceMonth: decision.month, forceYear: decision.year }
              : { allowOutOfRange: true },
          );
        }

        if (result.status === "error") {
          toast.error(formatUserFacingErrorMessage(result.message));
          continue;
        }
        if (result.status === "needs_confirmation") {
          toast.error("Statement month still does not match this period.");
          continue;
        }
        if (result.status === "updated") updated += 1;
        else saved += 1;
      }

      if (saved + updated > 0) {
        toast.success(manualSoaSavedMessage(saved, updated));
        onSaved();
      }
    } catch (error) {
      toast.error(
        formatUserFacingErrorMessage(
          error instanceof Error ? error.message : "Upload failed",
        ),
      );
    } finally {
      setIsPending(false);
      setProgressLabel(null);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  function handleFileInputChange(event: React.ChangeEvent<HTMLInputElement>) {
    const list = event.target.files;
    if (!list?.length) return;
    void uploadFiles([...list]);
  }

  return {
    fileRef,
    isPending,
    progressLabel,
    confirmPending,
    triggerFilePicker,
    handleFileInputChange,
    resolveConfirm,
  };
}
