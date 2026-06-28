/** Shared SOA run progress model (client + server). */

export type SoaRunStepId =
  | "prepare"
  | "gmail"
  | "parse"
  | "summary"
  | "save"
  | "telegram"
  | "slack"
  | "calendar"
  | "upload";

export type SoaRunStepStatus = "pending" | "active" | "done";

export type SoaRunStepSnapshot = {
  id: SoaRunStepId;
  label: string;
  status: SoaRunStepStatus;
};

export type SoaRunProgressStatus = "running" | "completed" | "failed";

export type SoaRunProgressSnapshot = {
  runId: string;
  status: SoaRunProgressStatus;
  progress: number;
  steps: SoaRunStepSnapshot[];
  detail: string | null;
  error: string | null;
};

export type SoaRunStepPlanInput = {
  monthCount: number;
  notifyTelegram: boolean;
  notifySlack: boolean;
  createCalendar: boolean;
};

export function buildSoaRunStepPlan(
  input: SoaRunStepPlanInput,
): SoaRunStepSnapshot[] {
  const months = Math.max(1, input.monthCount);
  const steps: SoaRunStepSnapshot[] = [
    { id: "prepare", label: "Preparing your cards", status: "pending" },
    {
      id: "gmail",
      label:
        months > 1
          ? `Searching Gmail for ${months} statement periods`
          : "Searching Gmail for statements",
      status: "pending",
    },
    {
      id: "parse",
      label:
        months > 1
          ? "Reading and unlocking statement PDFs"
          : "Reading your statement PDFs",
      status: "pending",
    },
    {
      id: "summary",
      label:
        months > 1
          ? "Building your multi-month summary"
          : "Building your summary",
      status: "pending",
    },
    { id: "save", label: "Saving statements and due dates", status: "pending" },
  ];

  if (input.notifyTelegram) {
    steps.push({
      id: "telegram",
      label: "Sending summary to Telegram",
      status: "pending",
    });
  }
  if (input.notifySlack) {
    steps.push({
      id: "slack",
      label: "Sending summary to Slack",
      status: "pending",
    });
  }
  if (input.createCalendar) {
    steps.push({
      id: "calendar",
      label: "Adding due dates to Google Calendar",
      status: "pending",
    });
  }

  steps.push({
    id: "upload",
    label: "Uploading statement PDFs",
    status: "pending",
  });

  return steps;
}

export const SOA_RUN_STEP_WEIGHTS: Record<SoaRunStepId, number> = {
  prepare: 4,
  gmail: 22,
  parse: 28,
  summary: 10,
  save: 12,
  telegram: 6,
  slack: 6,
  calendar: 6,
  upload: 6,
};

export function activeStepIndexFromSteps(
  steps: SoaRunStepSnapshot[],
  status: SoaRunProgressStatus,
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

export function computeSoaRunProgressPercent(options: {
  steps: SoaRunStepSnapshot[];
  monthCount: number;
  gmailMonthIndex: number;
  parseMonthIndex: number;
  parseFileFraction: number;
  uploadFraction: number;
}): number {
  const {
    steps,
    monthCount,
    gmailMonthIndex,
    parseMonthIndex,
    parseFileFraction,
    uploadFraction,
  } = options;

  const months = Math.max(1, monthCount);
  let done = 0;
  let total = 0;

  for (const step of steps) {
    const weight = SOA_RUN_STEP_WEIGHTS[step.id];
    total += weight;

    if (step.status === "done") {
      done += weight;
      continue;
    }

    if (step.status !== "active") continue;

    if (step.id === "gmail") {
      const monthFraction = Math.min(1, gmailMonthIndex / months);
      done += weight * monthFraction;
    } else if (step.id === "parse") {
      const monthBase = Math.min(1, parseMonthIndex / months);
      const withinMonth = Math.min(1, Math.max(0, parseFileFraction)) / months;
      done += weight * Math.min(1, monthBase + withinMonth);
    } else if (step.id === "upload") {
      done += weight * Math.min(1, Math.max(0, uploadFraction));
    } else {
      done += weight * 0.15;
    }
  }

  if (total <= 0) return 0;
  return Math.min(100, Math.max(0, Math.round((done / total) * 100)));
}
