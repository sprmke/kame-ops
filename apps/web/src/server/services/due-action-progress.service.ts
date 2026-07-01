import "server-only";

import { and, eq, lt } from "drizzle-orm";

import { db } from "@/lib/db";
import { dueActionProgress } from "@/lib/db/schema";
import {
  activeDueActionStepIndexFromSteps,
  buildDueActionStepPlan,
  computeDueActionProgressPercent,
  type DueActionProgressSnapshot,
  type DueActionProgressStatus,
  type DueActionStepId,
  type DueActionStepSnapshot,
  type DueActionType,
} from "@/lib/due-action-progress";

const STALE_MS = 24 * 60 * 60 * 1000;

function cloneSteps(steps: DueActionStepSnapshot[]): DueActionStepSnapshot[] {
  return steps.map((s) => ({ ...s }));
}

function setStepStatus(
  steps: DueActionStepSnapshot[],
  stepId: DueActionStepId,
  status: DueActionStepSnapshot["status"],
): void {
  for (const step of steps) {
    if (step.id === stepId) {
      step.status = status;
      return;
    }
  }
}

function markPreviousDone(
  steps: DueActionStepSnapshot[],
  stepId: DueActionStepId,
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

export class DueActionProgressReporter {
  private readonly processId: string;
  private readonly userId: string;
  private readonly action: DueActionType;
  private steps: DueActionStepSnapshot[];
  private status: DueActionProgressStatus = "running";
  private detail: string | null = null;
  private error: string | null = null;
  private flushTimer: ReturnType<typeof setTimeout> | null = null;
  private dirty = false;

  private constructor(
    processId: string,
    userId: string,
    action: DueActionType,
    steps: DueActionStepSnapshot[],
  ) {
    this.processId = processId;
    this.userId = userId;
    this.action = action;
    this.steps = steps;
  }

  static async create(
    userId: string,
    processId: string,
    action: DueActionType,
  ): Promise<DueActionProgressReporter> {
    const staleBefore = new Date(Date.now() - STALE_MS);
    await db
      .delete(dueActionProgress)
      .where(
        and(
          eq(dueActionProgress.userId, userId),
          lt(dueActionProgress.updatedAt, staleBefore),
        ),
      );

    const steps = buildDueActionStepPlan(action);
    const reporter = new DueActionProgressReporter(
      processId,
      userId,
      action,
      steps,
    );
    await reporter.persist(true);
    return reporter;
  }

  static async resume(
    userId: string,
    processId: string,
  ): Promise<DueActionProgressReporter | null> {
    const row = await db.query.dueActionProgress.findFirst({
      where: and(
        eq(dueActionProgress.id, processId),
        eq(dueActionProgress.userId, userId),
      ),
    });
    if (!row) return null;

    const reporter = new DueActionProgressReporter(
      processId,
      userId,
      row.action as DueActionType,
      row.steps,
    );
    reporter.status = row.status as DueActionProgressStatus;
    reporter.detail = row.detail;
    reporter.error = row.error;
    return reporter;
  }

  snapshot(): DueActionProgressSnapshot {
    return {
      processId: this.processId,
      action: this.action,
      status: this.status,
      progress: this.computeProgress(),
      steps: cloneSteps(this.steps),
      detail: this.detail,
      error: this.error,
    };
  }

  async activate(stepId: DueActionStepId, detail?: string): Promise<void> {
    if (this.status !== "running") return;
    this.steps = cloneSteps(this.steps);
    markPreviousDone(this.steps, stepId);
    if (detail) this.detail = detail;
    this.dirty = true;
    await this.scheduleFlush();
  }

  async completeStep(stepId: DueActionStepId): Promise<void> {
    if (this.status !== "running") return;
    this.steps = cloneSteps(this.steps);
    setStepStatus(this.steps, stepId, "done");
    this.dirty = true;
    await this.scheduleFlush();
  }

  async skipStep(stepId: DueActionStepId): Promise<void> {
    if (this.status !== "running") return;
    this.steps = cloneSteps(this.steps);
    setStepStatus(this.steps, stepId, "done");
    this.dirty = true;
    await this.scheduleFlush();
  }

  async complete(): Promise<void> {
    this.status = "completed";
    this.steps = cloneSteps(this.steps).map((s) => ({ ...s, status: "done" }));
    this.detail = null;
    this.dirty = true;
    await this.persist(true);
  }

  async fail(message: string): Promise<void> {
    this.status = "failed";
    this.error = message;
    this.dirty = true;
    await this.persist(true);
  }

  async flush(): Promise<void> {
    await this.persist(true);
  }

  private computeProgress(): number {
    if (this.status === "completed") return 100;
    return computeDueActionProgressPercent(this.steps);
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
      .insert(dueActionProgress)
      .values({
        id: this.processId,
        userId: this.userId,
        action: this.action,
        status: this.status,
        progress,
        steps: this.steps,
        detail: this.detail,
        error: this.error,
      })
      .onConflictDoUpdate({
        target: dueActionProgress.id,
        set: {
          status: this.status,
          progress,
          steps: this.steps,
          detail: this.detail,
          error: this.error,
          updatedAt: new Date(),
        },
      });
  }
}

export const dueActionProgressService = {
  async getSnapshot(
    userId: string,
    processId: string,
  ): Promise<DueActionProgressSnapshot | null> {
    const row = await db.query.dueActionProgress.findFirst({
      where: and(
        eq(dueActionProgress.id, processId),
        eq(dueActionProgress.userId, userId),
      ),
    });
    if (!row) return null;

    return {
      processId: row.id,
      action: row.action as DueActionType,
      status: row.status as DueActionProgressStatus,
      progress: row.status === "completed" ? 100 : row.progress,
      steps: row.steps,
      detail: row.detail,
      error: row.error,
    };
  },

  activeStepIndex(snapshot: DueActionProgressSnapshot): number {
    return activeDueActionStepIndexFromSteps(snapshot.steps, snapshot.status);
  },
};
