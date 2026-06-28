"use client";

import { useMemo } from "react";

import { activeStepIndexFromSteps } from "@/lib/soa-run-progress";
import { api } from "@/lib/api/client";

import type { RunSoaSettled } from "../components/RunSoaDialog";
import type { RunSoaProgressStep } from "../lib/run-soa-progress";

export function useRunSoaProgress(
  runId: string | null,
  fallbackSteps: RunSoaProgressStep[],
  isPending: boolean,
  settled: RunSoaSettled,
) {
  const { data: serverProgress } = api.soa.getRunProgress.useQuery(
    { runId: runId! },
    {
      enabled: Boolean(runId) && isPending,
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
    const activeStepIndex = activeStepIndexFromSteps(steps, status);
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
