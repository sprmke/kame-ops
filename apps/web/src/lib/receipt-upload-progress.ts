/** Shared receipt upload progress model (client + server). */

export type ReceiptUploadStepId =
  | "upload"
  | "prepare"
  | "validate"
  | "save"
  | "mark_paid"
  | "reminders"
  | "calendar"
  | "sync";

export type ReceiptUploadStepStatus = "pending" | "active" | "done";

export type ReceiptUploadStepSnapshot = {
  id: ReceiptUploadStepId;
  label: string;
  status: ReceiptUploadStepStatus;
};

export type ReceiptUploadProgressStatus = "running" | "completed" | "failed";

export type ReceiptUploadProgressSnapshot = {
  processId: string;
  status: ReceiptUploadProgressStatus;
  progress: number;
  steps: ReceiptUploadStepSnapshot[];
  detail: string | null;
  error: string | null;
};

export type ReceiptUploadStepPlanInput = {
  markPaid: boolean;
  updateCalendar: boolean;
};

export type ReceiptBatchPrepPhase = "uploading" | "analyzing" | "processing";

export type ReceiptBatchPrepProgress = {
  total: number;
  uploaded: number;
  phase: ReceiptBatchPrepPhase;
};

export function buildBatchPrepSteps(
  progress: ReceiptBatchPrepProgress,
): ReceiptUploadStepSnapshot[] {
  const { total, phase } = progress;
  const multi = total > 1;
  const analyzeDone = phase === "processing";

  return [
    {
      id: "upload",
      label: multi ? `Uploading ${total} receipts` : "Uploading receipt",
      status:
        phase === "uploading"
          ? "active"
          : phase === "analyzing" || analyzeDone
            ? "done"
            : "pending",
    },
    {
      id: "validate",
      label: multi ? `Analyzing ${total} receipts` : "Analyzing receipt",
      status: analyzeDone ? "done" : phase === "analyzing" ? "active" : "pending",
    },
    {
      id: "prepare",
      label: multi ? "Grouping by card" : "Identifying card",
      status: analyzeDone ? "done" : "pending",
    },
  ];
}

export function batchPrepDetail(progress: ReceiptBatchPrepProgress): string | null {
  if (progress.phase === "uploading" && progress.total > 1) {
    return `${progress.uploaded} of ${progress.total} uploaded`;
  }
  if (progress.phase === "analyzing") {
    return progress.total > 1 ? "Matching cards and amounts" : null;
  }
  return null;
}

export function computeBatchPrepProgressPercent(
  progress: ReceiptBatchPrepProgress,
): number {
  const { total, uploaded, phase } = progress;
  if (phase === "uploading") {
    const ratio = total > 0 ? uploaded / total : 0;
    return Math.round(8 + ratio * 32);
  }
  if (phase === "analyzing") {
    return 52;
  }
  return 68;
}

export function batchPrepActiveStepIndex(
  progress: ReceiptBatchPrepProgress,
): number {
  if (progress.phase === "uploading") return 0;
  if (progress.phase === "analyzing") return 1;
  return 2;
}

export function buildReceiptUploadStepPlan(
  input: ReceiptUploadStepPlanInput,
): ReceiptUploadStepSnapshot[] {
  const steps: ReceiptUploadStepSnapshot[] = [
    { id: "upload", label: "Uploading receipt", status: "pending" },
    { id: "prepare", label: "Loading cards and due dates", status: "pending" },
    { id: "validate", label: "Validating with AI", status: "pending" },
    { id: "save", label: "Saving receipt", status: "pending" },
  ];

  if (input.markPaid) {
    steps.push({
      id: "mark_paid",
      label: "Matching payment to due date",
      status: "pending",
    });
    steps.push({
      id: "reminders",
      label: "Silencing reminders",
      status: "pending",
    });
    if (input.updateCalendar) {
      steps.push({
        id: "calendar",
        label: "Updating Google Calendar",
        status: "pending",
      });
    }
    steps.push({
      id: "sync",
      label: "Syncing paid status",
      status: "pending",
    });
  }

  return steps;
}

export const RECEIPT_UPLOAD_STEP_WEIGHTS: Record<ReceiptUploadStepId, number> =
  {
    upload: 12,
    prepare: 6,
    validate: 38,
    save: 8,
    mark_paid: 18,
    reminders: 6,
    calendar: 6,
    sync: 6,
  };

export function activeReceiptStepIndexFromSteps(
  steps: ReceiptUploadStepSnapshot[],
  status: ReceiptUploadProgressStatus,
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

export function computeReceiptUploadProgressPercent(
  steps: ReceiptUploadStepSnapshot[],
): number {
  let done = 0;
  let total = 0;

  for (const step of steps) {
    const weight = RECEIPT_UPLOAD_STEP_WEIGHTS[step.id];
    total += weight;

    if (step.status === "done") {
      done += weight;
      continue;
    }

    if (step.status === "active") {
      done += weight * 0.2;
    }
  }

  if (total <= 0) return 0;
  return Math.min(100, Math.max(0, Math.round((done / total) * 100)));
}
