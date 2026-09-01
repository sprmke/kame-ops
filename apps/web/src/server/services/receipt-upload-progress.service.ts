import "server-only";

import { and, eq, lt } from "drizzle-orm";

import { db } from "@/lib/db";
import { receiptUploadProgress } from "@/lib/db/schema";
import {
  activeReceiptStepIndexFromSteps,
  buildReceiptUploadStepPlan,
  computeReceiptUploadProgressPercent,
  type ReceiptUploadProgressSnapshot,
  type ReceiptUploadProgressStatus,
  type ReceiptUploadStepId,
  type ReceiptUploadStepPlanInput,
  type ReceiptUploadStepSnapshot,
} from "@/lib/receipt-upload-progress";

/** Step ids that repeat once per receipt within a batch group. */
const REPEATABLE_STEP_IDS: ReadonlySet<ReceiptUploadStepId> = new Set([
  "validate",
  "save",
  "mark_paid",
  "reminders",
  "calendar",
  "sync",
]);

const STALE_MS = 24 * 60 * 60 * 1000;

function cloneSteps(
  steps: ReceiptUploadStepSnapshot[],
): ReceiptUploadStepSnapshot[] {
  return steps.map((s) => ({ ...s }));
}

function setStepStatus(
  steps: ReceiptUploadStepSnapshot[],
  stepId: ReceiptUploadStepId,
  status: ReceiptUploadStepSnapshot["status"],
): void {
  for (const step of steps) {
    if (step.id === stepId) {
      step.status = status;
      return;
    }
  }
}

function markPreviousDone(
  steps: ReceiptUploadStepSnapshot[],
  stepId: ReceiptUploadStepId,
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

export class ReceiptUploadProgressReporter {
  private readonly processId: string;
  private readonly userId: string;
  private steps: ReceiptUploadStepSnapshot[];
  private status: ReceiptUploadProgressStatus = "running";
  private detail: string | null = null;
  private error: string | null = null;
  private itemIndex = 1;
  private itemTotal = 1;
  private itemsCompleted = 0;
  private flushTimer: ReturnType<typeof setTimeout> | null = null;
  private dirty = false;

  private constructor(
    processId: string,
    userId: string,
    steps: ReceiptUploadStepSnapshot[],
  ) {
    this.processId = processId;
    this.userId = userId;
    this.steps = steps;
  }

  static async create(
    userId: string,
    processId: string,
    input: ReceiptUploadStepPlanInput & { totalItems?: number },
  ): Promise<ReceiptUploadProgressReporter> {
    const staleBefore = new Date(Date.now() - STALE_MS);
    await db
      .delete(receiptUploadProgress)
      .where(
        and(
          eq(receiptUploadProgress.userId, userId),
          lt(receiptUploadProgress.updatedAt, staleBefore),
        ),
      );

    const steps = buildReceiptUploadStepPlan(input);
    const reporter = new ReceiptUploadProgressReporter(
      processId,
      userId,
      steps,
    );
    reporter.itemTotal = Math.max(1, input.totalItems ?? 1);
    await reporter.persist(true);
    return reporter;
  }

  static async resume(
    userId: string,
    processId: string,
  ): Promise<ReceiptUploadProgressReporter | null> {
    const row = await db.query.receiptUploadProgress.findFirst({
      where: and(
        eq(receiptUploadProgress.id, processId),
        eq(receiptUploadProgress.userId, userId),
      ),
    });
    if (!row) return null;

    const reporter = new ReceiptUploadProgressReporter(
      processId,
      userId,
      row.steps,
    );
    reporter.status = row.status as ReceiptUploadProgressStatus;
    reporter.detail = row.detail;
    reporter.error = row.error;
    reporter.itemIndex = row.itemIndex;
    reporter.itemTotal = row.itemTotal;
    reporter.itemsCompleted = row.itemsCompleted;
    return reporter;
  }

  snapshot(): ReceiptUploadProgressSnapshot {
    return {
      processId: this.processId,
      status: this.status,
      progress: this.computeProgress(),
      steps: cloneSteps(this.steps),
      detail: this.detail,
      error: this.error,
      item: { index: this.itemIndex, total: this.itemTotal },
    };
  }

  async activate(stepId: ReceiptUploadStepId, detail?: string): Promise<void> {
    if (this.status !== "running") return;
    this.steps = cloneSteps(this.steps);
    markPreviousDone(this.steps, stepId);
    if (detail) this.detail = detail;
    this.dirty = true;
    await this.scheduleFlush();
  }

  async completeStep(stepId: ReceiptUploadStepId): Promise<void> {
    if (this.status !== "running") return;
    this.steps = cloneSteps(this.steps);
    setStepStatus(this.steps, stepId, "done");
    this.dirty = true;
    await this.scheduleFlush();
  }

  /**
   * Finalizes the receipt-repeatable steps (validate/save/mark_paid/
   * reminders/calendar/sync) for the item that just finished and, if there
   * is a next receipt in this batch group, resets those steps to "pending"
   * so the pipeline can run again.
   *
   * This replaces the old `resetSteps` behavior: marking done + resetting
   * happens as a single atomic update (one flush), and `itemsCompleted` is
   * incremented monotonically so the overall progress percentage — computed
   * from `itemsCompleted`, not the live step statuses alone — never regresses
   * even though the step checklist visually restarts for the next receipt.
   */
  async completeItemAndAdvance(nextIndex: number | null): Promise<void> {
    if (this.status !== "running") return;
    this.steps = cloneSteps(this.steps);
    for (const step of this.steps) {
      if (REPEATABLE_STEP_IDS.has(step.id) && step.status !== "done") {
        step.status = "done";
      }
    }
    this.itemsCompleted = Math.min(this.itemTotal, this.itemsCompleted + 1);

    if (nextIndex != null) {
      this.itemIndex = nextIndex;
      for (const step of this.steps) {
        if (REPEATABLE_STEP_IDS.has(step.id)) {
          step.status = "pending";
        }
      }
      this.detail = null;
    }

    this.dirty = true;
    await this.persist(true);
  }

  async complete(): Promise<void> {
    this.status = "completed";
    this.steps = cloneSteps(this.steps).map((s) => ({ ...s, status: "done" }));
    this.itemsCompleted = this.itemTotal;
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

  private computeProgress(): number {
    if (this.status === "completed") return 100;
    return computeReceiptUploadProgressPercent(this.steps, {
      total: this.itemTotal,
      completed: this.itemsCompleted,
    });
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
      .insert(receiptUploadProgress)
      .values({
        id: this.processId,
        userId: this.userId,
        status: this.status,
        progress,
        steps: this.steps,
        detail: this.detail,
        error: this.error,
        itemIndex: this.itemIndex,
        itemTotal: this.itemTotal,
        itemsCompleted: this.itemsCompleted,
      })
      .onConflictDoUpdate({
        target: receiptUploadProgress.id,
        set: {
          status: this.status,
          progress,
          steps: this.steps,
          detail: this.detail,
          error: this.error,
          itemIndex: this.itemIndex,
          itemTotal: this.itemTotal,
          itemsCompleted: this.itemsCompleted,
          updatedAt: new Date(),
        },
      });
  }
}

export const receiptUploadProgressService = {
  async getSnapshot(
    userId: string,
    processId: string,
  ): Promise<ReceiptUploadProgressSnapshot | null> {
    const row = await db.query.receiptUploadProgress.findFirst({
      where: and(
        eq(receiptUploadProgress.id, processId),
        eq(receiptUploadProgress.userId, userId),
      ),
    });
    if (!row) return null;

    return {
      processId: row.id,
      status: row.status as ReceiptUploadProgressStatus,
      progress: row.status === "completed" ? 100 : row.progress,
      steps: row.steps,
      detail: row.detail,
      error: row.error,
      item: { index: row.itemIndex, total: row.itemTotal },
    };
  },

  activeStepIndex(snapshot: ReceiptUploadProgressSnapshot): number {
    return activeReceiptStepIndexFromSteps(snapshot.steps, snapshot.status);
  },
};
