export type ReminderRunStepId = "prepare" | "channels" | "evaluate" | "send";

export type ReminderRunStepStatus = "pending" | "active" | "done";

export type ReminderRunStepSnapshot = {
  id: ReminderRunStepId;
  label: string;
  status: ReminderRunStepStatus;
};

export type ReminderRunProgressStatus = "running" | "completed" | "failed";

export type ReminderRunProgressSnapshot = {
  processId: string;
  status: ReminderRunProgressStatus;
  progress: number;
  steps: ReminderRunStepSnapshot[];
  detail: string | null;
  error: string | null;
};

export function buildReminderRunStepPlan(): ReminderRunStepSnapshot[] {
  return [
    { id: "prepare", label: "Loading due entries", status: "pending" },
    {
      id: "channels",
      label: "Checking Telegram and Slack",
      status: "pending",
    },
    {
      id: "evaluate",
      label: "Finding cards in reminder window",
      status: "pending",
    },
    { id: "send", label: "Sending reminders", status: "pending" },
  ];
}

export const REMINDER_RUN_STEP_WEIGHTS: Record<ReminderRunStepId, number> = {
  prepare: 15,
  channels: 15,
  evaluate: 20,
  send: 50,
};

export function activeReminderRunStepIndexFromSteps(
  steps: ReminderRunStepSnapshot[],
  status: ReminderRunProgressStatus,
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

export function computeReminderRunProgressPercent(
  steps: ReminderRunStepSnapshot[],
): number {
  let total = 0;
  for (const step of steps) {
    const weight = REMINDER_RUN_STEP_WEIGHTS[step.id];
    if (step.status === "done") total += weight;
    else if (step.status === "active") total += weight * 0.45;
  }
  return Math.min(100, Math.round(total));
}
