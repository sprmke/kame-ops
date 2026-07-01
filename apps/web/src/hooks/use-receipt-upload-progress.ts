"use client";

import { useMemo } from "react";

import {
  activeReceiptStepIndexFromSteps,
  type ReceiptUploadStepSnapshot,
} from "@/lib/receipt-upload-progress";
import { api } from "@/lib/api/client";

export type ReceiptUploadSettled = "success" | "error" | null;

export function useReceiptUploadProgress(
  processId: string | null,
  fallbackSteps: ReceiptUploadStepSnapshot[],
  isPending: boolean,
  settled: ReceiptUploadSettled,
) {
  const { data: serverProgress } = api.receipts.getUploadProgress.useQuery(
    { processId: processId! },
    {
      enabled: Boolean(processId) && isPending,
      refetchInterval: isPending ? 400 : false,
    },
  );

  const succeeded = settled === "success";
  const failed = settled === "error";

  return useMemo(() => {
    const steps = serverProgress?.steps ?? fallbackSteps;
    const status = succeeded
      ? "completed"
      : failed
        ? "failed"
        : (serverProgress?.status ?? "running");
    const progress = succeeded ? 100 : (serverProgress?.progress ?? 0);
    const activeStepIndex = activeReceiptStepIndexFromSteps(steps, status);
    const currentStep = steps[activeStepIndex] ?? steps[0];
    const detail = serverProgress?.detail ?? null;

    return {
      steps,
      activeStepIndex,
      progress,
      detail,
      finished: succeeded,
      failed,
      currentStep,
    };
  }, [serverProgress, fallbackSteps, succeeded, failed]);
}
