import "server-only";

import { and, eq, lt } from "drizzle-orm";

import { db } from "@/lib/db";
import { aiCategorizeProgress } from "@/lib/db/schema";
import {
  activeAiCategorizeStepIndexFromSteps,
  buildAiCategorizeStepPlan,
  computeAiCategorizeProgressPercent,
  type AiCategorizeProgressSnapshot,
  type AiCategorizeProgressStatus,
  type AiCategorizeStepId,
  type AiCategorizeStepSnapshot,
} from "@/lib/ai-categorize-progress";

const STALE_MS = 24 * 60 * 60 * 1000;

function cloneSteps(
  steps: AiCategorizeStepSnapshot[],
): AiCategorizeStepSnapshot[] {
  return steps.map((s) => ({ ...s }));
}

function setStepStatus(
  steps: AiCategorizeStepSnapshot[],
  stepId: AiCategorizeStepId,
  status: AiCategorizeStepSnapshot["status"],
): void {
  for (const step of steps) {
    if (step.id === stepId) {
      step.status = status;
      return;
    }
  }
}

function markPreviousDone(
  steps: AiCategorizeStepSnapshot[],
  stepId: AiCategorizeStepId,
): void {
  let found = false;
  for (const step of steps) {
    if (step.id === stepId) {
      found = true;
      break;
    }
    step.status = "done";
  }
  if (!found) return;
  setStepStatus(steps, stepId, "active");
}

export class AiCategorizeProgressReporter {
  private readonly processId: string;
  private readonly userId: string;
  private steps: AiCategorizeStepSnapshot[];
  private status: AiCategorizeProgressStatus = "running";
  private detail: string | null = null;
  private error: string | null = null;
  private aiBatchIndex = 0;
  private aiBatchTotal = 0;
  private flushTimer: ReturnType<typeof setTimeout> | null = null;
  private dirty = false;

  private constructor(
    processId: string,
    userId: string,
    steps: AiCategorizeStepSnapshot[],
  ) {
    this.processId = processId;
    this.userId = userId;
    this.steps = steps;
  }

  static async create(
    userId: string,
    processId: string,
  ): Promise<AiCategorizeProgressReporter> {
    const staleBefore = new Date(Date.now() - STALE_MS);
    await db
      .delete(aiCategorizeProgress)
      .where(
        and(
          eq(aiCategorizeProgress.userId, userId),
          lt(aiCategorizeProgress.updatedAt, staleBefore),
        ),
      );

    const steps = buildAiCategorizeStepPlan();
    const reporter = new AiCategorizeProgressReporter(processId, userId, steps);
    await reporter.persist(true);
    return reporter;
  }

  snapshot(): AiCategorizeProgressSnapshot {
    return {
      processId: this.processId,
      status: this.status,
      progress: this.computeProgress(),
      steps: cloneSteps(this.steps),
      detail: this.detail,
      error: this.error,
      aiBatchIndex: this.aiBatchIndex,
      aiBatchTotal: this.aiBatchTotal,
    };
  }

  async activate(stepId: AiCategorizeStepId, detail?: string): Promise<void> {
    if (this.status !== "running") return;
    this.steps = cloneSteps(this.steps);
    markPreviousDone(this.steps, stepId);
    if (detail) this.detail = detail;
    this.dirty = true;
    await this.scheduleFlush();
  }

  async completeStep(stepId: AiCategorizeStepId): Promise<void> {
    if (this.status !== "running") return;
    this.steps = cloneSteps(this.steps);
    setStepStatus(this.steps, stepId, "done");
    this.dirty = true;
    await this.scheduleFlush();
  }

  async setAiBatchProgress(
    batchIndex: number,
    batchTotal: number,
    detail?: string,
  ): Promise<void> {
    if (this.status !== "running") return;
    this.aiBatchIndex = batchIndex;
    this.aiBatchTotal = batchTotal;
    if (detail) this.detail = detail;
    this.dirty = true;
    await this.scheduleFlush();
  }

  async complete(): Promise<void> {
    this.status = "completed";
    this.steps = cloneSteps(this.steps).map((s) => ({ ...s, status: "done" }));
    this.detail = null;
    this.aiBatchIndex = this.aiBatchTotal;
    this.dirty = true;
    await this.persist(true);
  }

  async fail(message: string): Promise<void> {
    this.status = "failed";
    this.error = message;
    this.dirty = true;
    await this.persist(true);
  }

  private computeProgress(): number {
    if (this.status === "completed") return 100;
    return computeAiCategorizeProgressPercent(
      this.steps,
      this.aiBatchIndex,
      this.aiBatchTotal,
    );
  }

  private scheduleFlush(): Promise<void> {
    if (this.flushTimer) {
      return Promise.resolve();
    }
    return new Promise((resolve) => {
      this.flushTimer = setTimeout(() => {
        this.flushTimer = null;
        void this.persist(false).finally(resolve);
      }, 250);
    });
  }

  private async persist(force: boolean): Promise<void> {
    if (!force && !this.dirty) return;
    this.dirty = false;
    const progress = this.computeProgress();
    await db
      .insert(aiCategorizeProgress)
      .values({
        id: this.processId,
        userId: this.userId,
        status: this.status,
        progress,
        steps: this.steps,
        detail: this.detail,
        error: this.error,
        aiBatchIndex: this.aiBatchIndex,
        aiBatchTotal: this.aiBatchTotal,
      })
      .onConflictDoUpdate({
        target: aiCategorizeProgress.id,
        set: {
          status: this.status,
          progress,
          steps: this.steps,
          detail: this.detail,
          error: this.error,
          aiBatchIndex: this.aiBatchIndex,
          aiBatchTotal: this.aiBatchTotal,
          updatedAt: new Date(),
        },
      });
  }
}

export const aiCategorizeProgressService = {
  async getSnapshot(
    userId: string,
    processId: string,
  ): Promise<AiCategorizeProgressSnapshot | null> {
    const row = await db.query.aiCategorizeProgress.findFirst({
      where: and(
        eq(aiCategorizeProgress.id, processId),
        eq(aiCategorizeProgress.userId, userId),
      ),
    });
    if (!row) return null;

    return {
      processId: row.id,
      status: row.status as AiCategorizeProgressStatus,
      progress: row.status === "completed" ? 100 : row.progress,
      steps: row.steps,
      detail: row.detail,
      error: row.error,
      aiBatchIndex: row.aiBatchIndex,
      aiBatchTotal: row.aiBatchTotal,
    };
  },

  activeStepIndex(snapshot: AiCategorizeProgressSnapshot): number {
    return activeAiCategorizeStepIndexFromSteps(
      snapshot.steps,
      snapshot.status,
    );
  },
};
