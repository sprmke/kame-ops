/** Shared AI transaction categorization progress model (client + server). */

export type AiCategorizeStepId = "prepare" | "match_rules" | "ai" | "save";

export type AiCategorizeStepStatus = "pending" | "active" | "done";

export type AiCategorizeStepSnapshot = {
  id: AiCategorizeStepId;
  label: string;
  status: AiCategorizeStepStatus;
};

export type AiCategorizeProgressStatus = "running" | "completed" | "failed";

export type AiCategorizeProgressSnapshot = {
  processId: string;
  status: AiCategorizeProgressStatus;
  progress: number;
  steps: AiCategorizeStepSnapshot[];
  detail: string | null;
  error: string | null;
  aiBatchIndex: number;
  aiBatchTotal: number;
};

export function buildAiCategorizeStepPlan(): AiCategorizeStepSnapshot[] {
  return [
    { id: "prepare", label: "Loading transactions", status: "pending" },
    { id: "match_rules", label: "Matching keyword rules", status: "pending" },
    { id: "ai", label: "Categorizing with AI", status: "pending" },
    { id: "save", label: "Saving categories", status: "pending" },
  ];
}

export const AI_CATEGORIZE_STEP_WEIGHTS: Record<AiCategorizeStepId, number> = {
  prepare: 10,
  match_rules: 15,
  ai: 60,
  save: 15,
};

export function activeAiCategorizeStepIndexFromSteps(
  steps: AiCategorizeStepSnapshot[],
  status: AiCategorizeProgressStatus,
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

export function computeAiCategorizeProgressPercent(
  steps: AiCategorizeStepSnapshot[],
  aiBatchIndex: number,
  aiBatchTotal: number,
): number {
  let done = 0;
  let total = 0;

  for (const step of steps) {
    const weight = AI_CATEGORIZE_STEP_WEIGHTS[step.id];
    total += weight;

    if (step.status === "done") {
      done += weight;
      continue;
    }

    if (step.status === "active") {
      if (step.id === "ai" && aiBatchTotal > 0) {
        const batchFraction = Math.min(1, aiBatchIndex / aiBatchTotal);
        done += weight * Math.max(0.1, batchFraction);
      } else {
        done += weight * 0.2;
      }
    }
  }

  if (total <= 0) return 0;
  return Math.min(100, Math.max(0, Math.round((done / total) * 100)));
}
