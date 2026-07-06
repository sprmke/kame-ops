import { and, desc, eq } from "drizzle-orm";
import { z } from "zod";

import { isManagedAutomationJobType } from "@/lib/automations/job-types";
import {
  computeNextRunAt,
  lockScheduleToDaily,
  normalizeScheduleInput,
  readScheduleConfigFromJob,
  scheduleConfigToStorageString,
  isAutomationJobDue,
  type AutomationScheduleInput,
} from "@/lib/automations/schedule";
import { db } from "@/lib/db";
import { automationJobs, automationRuns, users } from "@/lib/db/schema";
import { ensureDefaultAutomationJobs } from "./default-automation.service";
import { defaultRunSoaInput, soaService } from "./soa.service";

const scheduleInputSchema = z.object({
  frequency: z.enum(["daily", "weekly", "monthly"]),
  hour: z.number().min(0).max(23),
  minute: z.number().min(0).max(59),
  dayOfWeek: z.number().min(0).max(6).optional(),
  dayOfMonth: z.number().min(1).max(28).optional(),
});

const jobSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  schedule: scheduleInputSchema,
  jobType: z.enum(["send_due_reminders", "run_soa_pipeline"]),
  config: z.record(z.unknown()).optional(),
  isActive: z.boolean().optional(),
});

const updateJobSchema = jobSchema.partial().extend({
  jobId: z.string().uuid(),
});

async function getUserTimezone(userId: string): Promise<string> {
  const user = await db.query.users.findFirst({
    where: eq(users.id, userId),
    columns: { timezone: true },
  });
  return user?.timezone ?? "Asia/Manila";
}

function buildJobConfig(
  schedule: AutomationScheduleInput,
  extra?: Record<string, unknown>,
) {
  const scheduleConfig = normalizeScheduleInput(schedule);
  return {
    ...(extra ?? {}),
    scheduleConfig,
  };
}

async function executeJob(
  userId: string,
  job: { id: string; jobType: string },
  options?: { force?: boolean; processId?: string },
) {
  const [run] = await db
    .insert(automationRuns)
    .values({ jobId: job.id, userId, status: "running" })
    .returning();

  if (!run) throw new Error("Failed to create automation run");

  try {
    let result: unknown;
    switch (job.jobType) {
      case "send_due_reminders": {
        const { reminderService } = await import("./reminder.service");
        result = await reminderService.sendDueRemindersForUser(userId, {
          force: options?.force,
          processId: options?.processId,
        });
        break;
      }
      case "run_soa_pipeline":
        result = await soaService.runSoaPipeline(userId, {
          ...defaultRunSoaInput(),
          runId: options?.processId,
        });
        break;
      default:
        throw new Error(`Unknown job type: ${job.jobType}`);
    }

    const completedAt = new Date();
    await db
      .update(automationRuns)
      .set({
        status: "completed",
        completedAt,
        resultSummary: JSON.stringify(result).slice(0, 2000),
      })
      .where(eq(automationRuns.id, run.id));

    return { runId: run.id, result, completedAt };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    await db
      .update(automationRuns)
      .set({
        status: "failed",
        completedAt: new Date(),
        errorMessage: message,
      })
      .where(eq(automationRuns.id, run.id));
    throw error;
  }
}

export const automationService = {
  ensureDefaultAutomationJobs,

  async list(userId: string) {
    await ensureDefaultAutomationJobs(userId);

    const jobs = await db.query.automationJobs.findMany({
      where: eq(automationJobs.userId, userId),
      orderBy: [desc(automationJobs.createdAt)],
      with: {
        runs: { limit: 1, orderBy: [desc(automationRuns.startedAt)] },
      },
    });

    return jobs.map(({ runs, ...job }) => ({
      ...job,
      lastRun: runs[0] ?? null,
    }));
  },

  async create(userId: string, input: z.infer<typeof jobSchema>) {
    const data = jobSchema.parse(input);
    if (isManagedAutomationJobType(data.jobType)) {
      throw new Error("This automation is managed automatically.");
    }
    const scheduleConfig = normalizeScheduleInput(data.schedule);
    const timezone = await getUserTimezone(userId);
    const nextRunAt = computeNextRunAt(scheduleConfig, timezone);

    const [job] = await db
      .insert(automationJobs)
      .values({
        userId,
        name: data.name,
        description: data.description,
        schedule: scheduleConfigToStorageString(scheduleConfig),
        jobType: data.jobType,
        config: buildJobConfig(data.schedule, data.config),
        isActive: data.isActive ?? true,
        nextRunAt,
      })
      .returning();
    return job;
  },

  async update(userId: string, input: z.infer<typeof updateJobSchema>) {
    const data = updateJobSchema.parse(input);
    const existing = await db.query.automationJobs.findFirst({
      where: and(
        eq(automationJobs.id, data.jobId),
        eq(automationJobs.userId, userId),
      ),
    });
    if (!existing) throw new Error("Job not found");

    const scheduleInput =
      data.schedule &&
      (existing.jobType === "send_due_reminders" ||
        data.jobType === "send_due_reminders")
        ? lockScheduleToDaily(data.schedule)
        : data.schedule;
    const scheduleConfig = scheduleInput
      ? normalizeScheduleInput(scheduleInput)
      : readScheduleConfigFromJob(existing);
    const timezone = await getUserTimezone(userId);
    const nextRunAt = computeNextRunAt(scheduleConfig, timezone);

    const [job] = await db
      .update(automationJobs)
      .set({
        name: data.name ?? existing.name,
        description: data.description ?? existing.description,
        schedule: scheduleConfigToStorageString(scheduleConfig),
        jobType: data.jobType ?? existing.jobType,
        config: scheduleInput
          ? buildJobConfig(scheduleInput, {
              ...(existing.config ?? {}),
              ...(data.config ?? {}),
            })
          : (data.config ?? existing.config ?? {}),
        isActive: data.isActive ?? existing.isActive,
        nextRunAt,
      })
      .where(eq(automationJobs.id, data.jobId))
      .returning();

    return job;
  },

  async setActive(userId: string, jobId: string, isActive: boolean) {
    const existing = await db.query.automationJobs.findFirst({
      where: and(
        eq(automationJobs.id, jobId),
        eq(automationJobs.userId, userId),
      ),
    });
    if (!existing) throw new Error("Job not found");

    const timezone = await getUserTimezone(userId);
    const scheduleConfig = readScheduleConfigFromJob(existing);
    const nextRunAt = isActive
      ? computeNextRunAt(scheduleConfig, timezone)
      : null;

    const [job] = await db
      .update(automationJobs)
      .set({ isActive, nextRunAt })
      .where(eq(automationJobs.id, jobId))
      .returning();

    return job;
  },

  async delete(userId: string, jobId: string) {
    const existing = await db.query.automationJobs.findFirst({
      where: and(
        eq(automationJobs.id, jobId),
        eq(automationJobs.userId, userId),
      ),
    });
    if (!existing) throw new Error("Job not found");
    if (isManagedAutomationJobType(existing.jobType)) {
      throw new Error("This automation is managed automatically.");
    }

    await db.delete(automationJobs).where(eq(automationJobs.id, jobId));
    return { ok: true };
  },

  async runJob(userId: string, jobId: string, processId?: string) {
    const job = await db.query.automationJobs.findFirst({
      where: and(
        eq(automationJobs.id, jobId),
        eq(automationJobs.userId, userId),
      ),
    });
    if (!job) throw new Error("Job not found");

    const timezone = await getUserTimezone(userId);
    const scheduleConfig = readScheduleConfigFromJob(job);
    const { runId, result, completedAt } = await executeJob(userId, job, {
      force: job.jobType === "send_due_reminders",
      processId,
    });

    await db
      .update(automationJobs)
      .set({
        lastRunAt: completedAt,
        nextRunAt: computeNextRunAt(scheduleConfig, timezone, completedAt),
      })
      .where(eq(automationJobs.id, jobId));

    return { runId, result, jobType: job.jobType };
  },

  async dispatchDueJobs(now = new Date()) {
    const jobs = await db.query.automationJobs.findMany({
      where: eq(automationJobs.isActive, true),
      with: {
        user: {
          columns: { id: true, timezone: true },
        },
      },
    });

    const results: Array<{
      jobId: string;
      userId: string;
      status: "completed" | "failed" | "skipped";
      error?: string;
    }> = [];

    for (const job of jobs) {
      const timezone = job.user?.timezone ?? "Asia/Manila";
      const scheduleConfig = readScheduleConfigFromJob(job);

      if (
        !isAutomationJobDue(scheduleConfig, timezone, now, {
          lastRunAt: job.lastRunAt,
          nextRunAt: job.nextRunAt,
        })
      ) {
        results.push({
          jobId: job.id,
          userId: job.userId,
          status: "skipped",
        });
        continue;
      }

      try {
        const { completedAt } = await executeJob(job.userId, job);
        await db
          .update(automationJobs)
          .set({
            lastRunAt: completedAt,
            nextRunAt: computeNextRunAt(scheduleConfig, timezone, completedAt),
          })
          .where(eq(automationJobs.id, job.id));

        results.push({
          jobId: job.id,
          userId: job.userId,
          status: "completed",
        });
      } catch (error) {
        results.push({
          jobId: job.id,
          userId: job.userId,
          status: "failed",
          error: error instanceof Error ? error.message : "Unknown error",
        });
      }
    }

    const ran = results.filter((r) => r.status === "completed").length;
    const failed = results.filter((r) => r.status === "failed").length;

    return { ok: true, ran, failed, results };
  },
};

export { scheduleInputSchema, jobSchema, updateJobSchema };
