"use client";

import { useMemo } from "react";

import {
  activeDueActionStepIndexFromSteps,
  type DueActionStepSnapshot,
} from "@/lib/due-action-progress";
import { api } from "@/lib/api/client";

import type { DueActionSettled } from "../components/DueActionProgressDialog";

export function useDueActionProgress(
  processId: string | null,
  fallbackSteps: DueActionStepSnapshot[],
  isPending: boolean,
  settled: DueActionSettled,
) {
  const { data: serverProgress } = api.reminders.getActionProgress.useQuery(
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
    const activeStepIndex = activeDueActionStepIndexFromSteps(steps, status);
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
