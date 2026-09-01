"use client";

import { useMemo } from "react";

import {
  activeReceiptStepIndexFromSteps,
  computeBatchPrepProgressPercent,
  type ReceiptUploadStepSnapshot,
} from "@/lib/receipt-upload-progress";
import { api } from "@/lib/api/client";

export type ReceiptUploadSettled = "success" | "error" | null;

/** Prep phase ends at this percent; card processing maps server 0–100 into this range. */
const CARD_PROGRESS_FLOOR = computeBatchPrepProgressPercent({
  total: 1,
  uploaded: 1,
  phase: "processing",
});

function mapServerProgressToCardPhase(serverPercent: number): number {
  const headroom = 100 - CARD_PROGRESS_FLOOR;
  return CARD_PROGRESS_FLOOR + Math.round((serverPercent * headroom) / 100);
}

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
    const awaitingSnapshot = isPending && settled === null && !serverProgress;
    const serverPercent = serverProgress?.progress ?? 0;
    const progress = succeeded
      ? 100
      : awaitingSnapshot
        ? CARD_PROGRESS_FLOOR
        : mapServerProgressToCardPhase(serverPercent);
    const activeStepIndex = activeReceiptStepIndexFromSteps(steps, status);
    const currentStep = steps[activeStepIndex] ?? steps[0];
    const detail = serverProgress?.detail ?? null;
    const item = serverProgress?.item ?? null;

    return {
      steps,
      activeStepIndex,
      progress,
      detail,
      finished: succeeded,
      failed,
      currentStep,
      item,
    };
  }, [serverProgress, fallbackSteps, succeeded, failed, isPending, settled]);
}
