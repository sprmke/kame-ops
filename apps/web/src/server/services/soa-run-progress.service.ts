import "server-only";

import { and, eq, lt } from "drizzle-orm";

import { db } from "@/lib/db";
import { soaRunProgress } from "@/lib/db/schema";
import {
  activeStepIndexFromSteps,
  buildSoaRunStepPlan,
  computeSoaRunProgressPercent,
  type SoaRunProgressSnapshot,
  type SoaRunProgressStatus,
  type SoaRunStepId,
  type SoaRunStepSnapshot,
} from "@/lib/soa-run-progress";

import type { RunSoaPipelineInput } from "./soa.service";

const STALE_MS = 24 * 60 * 60 * 1000;

function cloneSteps(steps: SoaRunStepSnapshot[]): SoaRunStepSnapshot[] {
  return steps.map((s) => ({ ...s }));
}

function setStepStatus(
  steps: SoaRunStepSnapshot[],
  stepId: SoaRunStepId,
  status: SoaRunStepSnapshot["status"],
): void {
  for (const step of steps) {
    if (step.id === stepId) {
      step.status = status;
      return;
    }
  }
}

function markPreviousDone(
  steps: SoaRunStepSnapshot[],
  stepId: SoaRunStepId,
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

export class SoaRunProgressReporter {
  private readonly runId: string;
  private readonly userId: string;
  private readonly monthCount: number;
  private steps: SoaRunStepSnapshot[];
  private status: SoaRunProgressStatus = "running";
  private detail: string | null = null;
  private error: string | null = null;
  private gmailMonthIndex = 0;
  private parseMonthIndex = 0;
  private parseFileFraction = 0;
  private uploadFraction = 0;
  private flushTimer: ReturnType<typeof setTimeout> | null = null;
  private dirty = false;

  private constructor(
    runId: string,
    userId: string,
    steps: SoaRunStepSnapshot[],
    monthCount: number,
  ) {
    this.runId = runId;
    this.userId = userId;
    this.steps = steps;
    this.monthCount = monthCount;
  }

  static async create(
    userId: string,
    runId: string,
    input: RunSoaPipelineInput,
    monthCount: number,
  ): Promise<SoaRunProgressReporter> {
    const staleBefore = new Date(Date.now() - STALE_MS);
    await db
      .delete(soaRunProgress)
      .where(
        and(
          eq(soaRunProgress.userId, userId),
          lt(soaRunProgress.updatedAt, staleBefore),
        ),
      );

    const steps = buildSoaRunStepPlan({
      monthCount,
      notifyTelegram: input.notifyTelegram,
      notifySlack: input.notifySlack,
      createCalendar: input.createCalendar,
    });

    const reporter = new SoaRunProgressReporter(
      runId,
      userId,
      steps,
      monthCount,
    );
    await reporter.persist(true);
    return reporter;
  }

  snapshot(): SoaRunProgressSnapshot {
    const progress = this.computeProgress();
    return {
      runId: this.runId,
      status: this.status,
      progress,
      steps: cloneSteps(this.steps),
      detail: this.detail,
      error: this.error,
    };
  }

  async activate(stepId: SoaRunStepId, detail?: string): Promise<void> {
    if (this.status !== "running") return;
    this.steps = cloneSteps(this.steps);
    markPreviousDone(this.steps, stepId);
    if (detail) this.detail = detail;
    this.dirty = true;
    await this.scheduleFlush();
  }

  async completeStep(stepId: SoaRunStepId): Promise<void> {
    if (this.status !== "running") return;
    this.steps = cloneSteps(this.steps);
    setStepStatus(this.steps, stepId, "done");
    this.dirty = true;
    await this.scheduleFlush();
  }

  async setGmailProgress(
    monthIndex: number,
    monthLabel: string,
    bankLabel?: string,
  ): Promise<void> {
    if (this.status !== "running") return;
    this.gmailMonthIndex = monthIndex;
    this.detail = bankLabel
      ? `${monthLabel} · ${bankLabel}`
      : `${monthLabel} · Searching Gmail`;
    await this.activate("gmail", this.detail);
  }

  async setParseProgress(
    monthIndex: number,
    monthLabel: string,
    fileIndex: number,
    fileCount: number,
    bankLabel?: string,
    fileName?: string,
  ): Promise<void> {
    if (this.status !== "running") return;
    this.parseMonthIndex = monthIndex;
    this.parseFileFraction =
      fileCount > 0 ? Math.round((fileIndex / fileCount) * 100) : 0;
    const fileHint = fileName ? ` · ${fileName}` : "";
    this.detail = bankLabel
      ? `${monthLabel} · ${bankLabel}${fileHint}`
      : `${monthLabel} · Reading PDFs${fileHint}`;
    await this.activate("parse", this.detail);
  }

  async setUploadProgress(uploaded: number, total: number): Promise<void> {
    if (this.status !== "running") return;
    this.uploadFraction = total > 0 ? Math.round((uploaded / total) * 100) : 0;
    this.detail =
      total > 1
        ? `Uploading ${uploaded} of ${total} PDFs`
        : "Uploading statement PDFs";
    await this.activate("upload", this.detail);
  }

  async complete(): Promise<void> {
    this.status = "completed";
    this.steps = cloneSteps(this.steps).map((s) => ({ ...s, status: "done" }));
    this.detail = null;
    this.uploadFraction = 100;
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
    if (!this.dirty) return;
    await this.persist(true);
  }

  private computeProgress(): number {
    if (this.status === "completed") return 100;
    if (this.status === "failed") {
      return computeSoaRunProgressPercent({
        steps: this.steps,
        monthCount: this.monthCount,
        gmailMonthIndex: this.gmailMonthIndex,
        parseMonthIndex: this.parseMonthIndex,
        parseFileFraction: this.parseFileFraction / 100,
        uploadFraction: this.uploadFraction / 100,
      });
    }
    return computeSoaRunProgressPercent({
      steps: this.steps,
      monthCount: this.monthCount,
      gmailMonthIndex: this.gmailMonthIndex,
      parseMonthIndex: this.parseMonthIndex,
      parseFileFraction: this.parseFileFraction / 100,
      uploadFraction: this.uploadFraction / 100,
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
      .insert(soaRunProgress)
      .values({
        id: this.runId,
        userId: this.userId,
        status: this.status,
        progress,
        steps: this.steps,
        detail: this.detail,
        error: this.error,
        monthCount: this.monthCount,
        gmailMonthIndex: this.gmailMonthIndex,
        parseMonthIndex: this.parseMonthIndex,
        parseFileFraction: this.parseFileFraction,
        uploadFraction: this.uploadFraction,
      })
      .onConflictDoUpdate({
        target: soaRunProgress.id,
        set: {
          status: this.status,
          progress,
          steps: this.steps,
          detail: this.detail,
          error: this.error,
          monthCount: this.monthCount,
          gmailMonthIndex: this.gmailMonthIndex,
          parseMonthIndex: this.parseMonthIndex,
          parseFileFraction: this.parseFileFraction,
          uploadFraction: this.uploadFraction,
          updatedAt: new Date(),
        },
      });
  }
}

export const soaRunProgressService = {
  async getSnapshot(
    userId: string,
    runId: string,
  ): Promise<SoaRunProgressSnapshot | null> {
    const row = await db.query.soaRunProgress.findFirst({
      where: and(
        eq(soaRunProgress.id, runId),
        eq(soaRunProgress.userId, userId),
      ),
    });
    if (!row) return null;

    const steps = row.steps;
    return {
      runId: row.id,
      status: row.status as SoaRunProgressStatus,
      progress: row.status === "completed" ? 100 : row.progress,
      steps,
      detail: row.detail,
      error: row.error,
    };
  },

  activeStepIndex(snapshot: SoaRunProgressSnapshot): number {
    return activeStepIndexFromSteps(snapshot.steps, snapshot.status);
  },
};

export type SoaRunMonthProgressContext = {
  monthIndex: number;
  totalMonths: number;
  monthLabel: string;
  reporter: SoaRunProgressReporter;
};
