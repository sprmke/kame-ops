"use client";

import { useMemo } from "react";

import { api } from "@/lib/api/client";
import type { AutomationJobType } from "@/lib/automations/job-types";

import type { AutomationRunSettled } from "../components/AutomationRunProgressDialog";

function activeStepIndexFromSteps(
  steps: { status: string }[],
  status: string,
): number {
  if (status === "completed") {
    return Math.max(0, steps.length - 1);
  }
  const active = steps.findIndex((s) => s.status === "active");
  if (active >= 0) return active;
  for (let i = steps.length - 1; i >= 0; i--) {
    if (steps[i]?.status === "done") {
      return Math.min(i + 1, steps.length - 1);
    }
  }
  return 0;
}

export function useAutomationRunProgress(
  processId: string | null,
  jobType: AutomationJobType | null,
  fallbackSteps: {
    id: string;
    label: string;
    status: "pending" | "active" | "done";
  }[],
  isPending: boolean,
  settled: AutomationRunSettled,
) {
  const { data: serverProgress } = api.automations.getRunProgress.useQuery(
    {
      processId: processId!,
      jobType: jobType!,
    },
    {
      enabled: Boolean(processId && jobType) && isPending,
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
