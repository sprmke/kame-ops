import "server-only";

import { and, eq, lt } from "drizzle-orm";

import { db } from "@/lib/db";
import { reminderRunProgress } from "@/lib/db/schema";
import {
  activeReminderRunStepIndexFromSteps,
  buildReminderRunStepPlan,
  computeReminderRunProgressPercent,
  type ReminderRunProgressSnapshot,
  type ReminderRunProgressStatus,
  type ReminderRunStepId,
  type ReminderRunStepSnapshot,
} from "@/lib/reminder-run-progress";

const STALE_MS = 24 * 60 * 60 * 1000;

function cloneSteps(
  steps: ReminderRunStepSnapshot[],
): ReminderRunStepSnapshot[] {
  return steps.map((s) => ({ ...s }));
}

function setStepStatus(
  steps: ReminderRunStepSnapshot[],
  stepId: ReminderRunStepId,
  status: ReminderRunStepSnapshot["status"],
): void {
  for (const step of steps) {
    if (step.id === stepId) {
      step.status = status;
      return;
    }
  }
}

function markPreviousDone(
  steps: ReminderRunStepSnapshot[],
  stepId: ReminderRunStepId,
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

export class ReminderRunProgressReporter {
  private readonly processId: string;
  private readonly userId: string;
  private steps: ReminderRunStepSnapshot[];
  private status: ReminderRunProgressStatus = "running";
  private detail: string | null = null;
  private error: string | null = null;
  private flushTimer: ReturnType<typeof setTimeout> | null = null;
  private dirty = false;

  private constructor(
    processId: string,
    userId: string,
    steps: ReminderRunStepSnapshot[],
  ) {
    this.processId = processId;
    this.userId = userId;
    this.steps = steps;
  }

  static async create(
    userId: string,
    processId: string,
  ): Promise<ReminderRunProgressReporter> {
    const staleBefore = new Date(Date.now() - STALE_MS);
    await db
      .delete(reminderRunProgress)
      .where(
        and(
          eq(reminderRunProgress.userId, userId),
          lt(reminderRunProgress.updatedAt, staleBefore),
        ),
      );

    const reporter = new ReminderRunProgressReporter(
      processId,
      userId,
      buildReminderRunStepPlan(),
    );
    await reporter.persist(true);
    return reporter;
  }

  snapshot(): ReminderRunProgressSnapshot {
    return {
      processId: this.processId,
      status: this.status,
      progress: computeReminderRunProgressPercent(this.steps),
      steps: cloneSteps(this.steps),
      detail: this.detail,
      error: this.error,
    };
  }

  async activate(stepId: ReminderRunStepId, detail?: string): Promise<void> {
    markPreviousDone(this.steps, stepId);
    if (detail !== undefined) this.detail = detail;
    await this.persist();
  }

  async completeStep(stepId: ReminderRunStepId): Promise<void> {
    setStepStatus(this.steps, stepId, "done");
    await this.persist();
  }

  async setDetail(detail: string | null): Promise<void> {
    this.detail = detail;
    await this.persist();
  }

  async complete(detail?: string | null): Promise<void> {
    for (const step of this.steps) {
      step.status = "done";
    }
    this.status = "completed";
    if (detail !== undefined) this.detail = detail;
    await this.persist(true);
  }

  async fail(message: string): Promise<void> {
    this.status = "failed";
    this.error = message;
    await this.persist(true);
  }

  private scheduleFlush(): void {
    this.dirty = true;
    if (this.flushTimer) return;
    this.flushTimer = setTimeout(() => {
      this.flushTimer = null;
      void this.persist(true);
    }, 200);
  }

  private async persist(force = false): Promise<void> {
    if (!force && !this.dirty) return;
    this.dirty = false;

    const progress = computeReminderRunProgressPercent(this.steps);
    await db
      .insert(reminderRunProgress)
      .values({
        id: this.processId,
        userId: this.userId,
        status: this.status,
        progress,
        steps: cloneSteps(this.steps),
        detail: this.detail,
        error: this.error,
      })
      .onConflictDoUpdate({
        target: reminderRunProgress.id,
        set: {
          status: this.status,
          progress,
          steps: cloneSteps(this.steps),
          detail: this.detail,
          error: this.error,
        },
      });
  }
}

export const reminderRunProgressService = {
  async getSnapshot(
    userId: string,
    processId: string,
  ): Promise<ReminderRunProgressSnapshot | null> {
    const row = await db.query.reminderRunProgress.findFirst({
      where: and(
        eq(reminderRunProgress.id, processId),
        eq(reminderRunProgress.userId, userId),
      ),
    });
    if (!row) return null;

    return {
      processId: row.id,
      status: row.status as ReminderRunProgressStatus,
      progress: row.progress,
      steps: row.steps,
      detail: row.detail,
      error: row.error,
    };
  },

  activeStepIndex(snapshot: ReminderRunProgressSnapshot): number {
    return activeReminderRunStepIndexFromSteps(snapshot.steps, snapshot.status);
  },
};
