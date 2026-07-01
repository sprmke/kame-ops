/** Shared due-entry action progress model (mark paid / mark unpaid). */

export type DueActionType = "mark_paid" | "mark_unpaid";

export type DueActionStepId =
  | "prepare"
  | "mark"
  | "receipt"
  | "reminders"
  | "sync";

export type DueActionStepStatus = "pending" | "active" | "done";

export type DueActionStepSnapshot = {
  id: DueActionStepId;
  label: string;
  status: DueActionStepStatus;
};

export type DueActionProgressStatus = "running" | "completed" | "failed";

export type DueActionProgressSnapshot = {
  processId: string;
  action: DueActionType;
  status: DueActionProgressStatus;
  progress: number;
  steps: DueActionStepSnapshot[];
  detail: string | null;
  error: string | null;
};

export function buildDueActionStepPlan(
  action: DueActionType,
): DueActionStepSnapshot[] {
  const steps: DueActionStepSnapshot[] = [
    { id: "prepare", label: "Loading due entry", status: "pending" },
    {
      id: "mark",
      label:
        action === "mark_paid" ? "Marking card paid" : "Marking card unpaid",
      status: "pending",
    },
  ];

  if (action === "mark_paid") {
    steps.push({
      id: "reminders",
      label: "Silencing reminders",
      status: "pending",
    });
  } else {
    steps.push({
      id: "receipt",
      label: "Removing payment receipt",
      status: "pending",
    });
  }

  steps.push({
    id: "sync",
    label: "Syncing status",
    status: "pending",
  });

  return steps;
}

export const DUE_ACTION_STEP_WEIGHTS: Record<DueActionStepId, number> = {
  prepare: 10,
  mark: 40,
  receipt: 25,
  reminders: 20,
  sync: 25,
};

export function activeDueActionStepIndexFromSteps(
  steps: DueActionStepSnapshot[],
  status: DueActionProgressStatus,
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

export function computeDueActionProgressPercent(
  steps: DueActionStepSnapshot[],
): number {
  let done = 0;
  let total = 0;

  for (const step of steps) {
    const weight = DUE_ACTION_STEP_WEIGHTS[step.id];
    total += weight;

    if (step.status === "done") {
      done += weight;
      continue;
    }

    if (step.status === "active") {
      done += weight * 0.25;
    }
  }

  if (total <= 0) return 0;
  return Math.min(100, Math.max(0, Math.round((done / total) * 100)));
}
