"use client";

import { useMemo } from "react";

import {
  activeAiCategorizeStepIndexFromSteps,
  type AiCategorizeStepSnapshot,
} from "@/lib/ai-categorize-progress";
import { api } from "@/lib/api/client";

export type AiCategorizeSettled = "success" | "error" | null;

export function useAiCategorizeProgress(
  processId: string | null,
  fallbackSteps: AiCategorizeStepSnapshot[],
  isPending: boolean,
  settled: AiCategorizeSettled,
) {
  const { data: serverProgress } =
    api.transactionCategories.getCategorizeProgress.useQuery(
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
    const activeStepIndex = activeAiCategorizeStepIndexFromSteps(steps, status);
    const detail = serverProgress?.detail ?? null;

    return {
      steps,
      activeStepIndex,
      progress,
      detail,
      finished: succeeded,
      failed,
    };
  }, [serverProgress, fallbackSteps, succeeded, failed]);
}
