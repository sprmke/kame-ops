import { and, desc, eq, inArray } from "drizzle-orm";

import {
  DEFAULT_AUTOMATION_SCHEDULE,
  defaultRemindersJobName,
  defaultSoaPipelineJobName,
} from "@/lib/automations/defaults";
import {
  computeNextRunAt,
  lockScheduleToDaily,
  normalizeScheduleInput,
  readScheduleConfigFromJob,
  scheduleConfigToStorageString,
  type AutomationScheduleInput,
} from "@/lib/automations/schedule";
import { db } from "@/lib/db";
import { automationJobs, users } from "@/lib/db/schema";
import { cachedPerRequest } from "@/server/lib/request-cache";

type AutomationJobRow = typeof automationJobs.$inferSelect;

async function getUserTimezone(userId: string): Promise<string> {
  const user = await db.query.users.findFirst({
    where: eq(users.id, userId),
    columns: { timezone: true },
  });
  return user?.timezone ?? "Asia/Manila";
}

function pickCanonicalJob(jobs: AutomationJobRow[]): AutomationJobRow {
  return [...jobs].sort((a, b) => {
    if (a.isActive !== b.isActive) return a.isActive ? -1 : 1;

    const aLastRun = a.lastRunAt?.getTime() ?? 0;
    const bLastRun = b.lastRunAt?.getTime() ?? 0;
    if (aLastRun !== bLastRun) return bLastRun - aLastRun;

    return a.createdAt.getTime() - b.createdAt.getTime();
  })[0]!;
}

async function dedupeJobsByType(
  userId: string,
  jobType: string,
): Promise<AutomationJobRow | null> {
  const jobs = await db.query.automationJobs.findMany({
    where: and(
      eq(automationJobs.userId, userId),
      eq(automationJobs.jobType, jobType),
    ),
    orderBy: [desc(automationJobs.updatedAt)],
  });

  if (jobs.length <= 1) return jobs[0] ?? null;

  const keep = pickCanonicalJob(jobs);
  const duplicateIds = jobs
    .filter((job) => job.id !== keep.id)
    .map((job) => job.id);

  if (duplicateIds.length > 0) {
    await db
      .delete(automationJobs)
      .where(inArray(automationJobs.id, duplicateIds));
  }

  return keep;
}

async function insertDefaultJob(
  userId: string,
  input: {
    jobType: string;
    name: string;
    schedule: AutomationScheduleInput;
  },
) {
  const scheduleConfig = normalizeScheduleInput(input.schedule);
  const timezone = await getUserTimezone(userId);
  const nextRunAt = computeNextRunAt(scheduleConfig, timezone);

  const [job] = await db
    .insert(automationJobs)
    .values({
      userId,
      name: input.name,
      schedule: scheduleConfigToStorageString(scheduleConfig),
      jobType: input.jobType,
      config: { scheduleConfig },
      isActive: true,
      nextRunAt,
    })
    .returning();

  return job!;
}

async function ensureRemindersJobScheduleIsDaily(
  userId: string,
  job: AutomationJobRow,
): Promise<AutomationJobRow> {
  const scheduleConfig = readScheduleConfigFromJob(job);
  if (scheduleConfig.frequency === "daily") return job;

  const fixed = normalizeScheduleInput(lockScheduleToDaily(scheduleConfig));
  const timezone = await getUserTimezone(userId);
  const nextRunAt = computeNextRunAt(fixed, timezone);

  const [updated] = await db
    .update(automationJobs)
    .set({
      schedule: scheduleConfigToStorageString(fixed),
      config: { ...(job.config ?? {}), scheduleConfig: fixed },
      nextRunAt,
    })
    .where(eq(automationJobs.id, job.id))
    .returning();

  return updated ?? job;
}

export async function ensureDefaultRemindersJob(userId: string) {
  const existing = await dedupeJobsByType(userId, "send_due_reminders");
  if (existing) {
    return ensureRemindersJobScheduleIsDaily(userId, existing);
  }

  return insertDefaultJob(userId, {
    jobType: "send_due_reminders",
    name: defaultRemindersJobName(),
    schedule: DEFAULT_AUTOMATION_SCHEDULE,
  });
}

export async function ensureDefaultSoaPipelineJob(userId: string) {
  const existing = await dedupeJobsByType(userId, "run_soa_pipeline");
  if (existing) return existing;

  return insertDefaultJob(userId, {
    jobType: "run_soa_pipeline",
    name: defaultSoaPipelineJobName(),
    schedule: DEFAULT_AUTOMATION_SCHEDULE,
  });
}

/** Idempotent seed called by several read paths, so run it once per request. */
export const ensureDefaultAutomationJobs = cachedPerRequest(
  "automations.ensureDefaults",
  async (userId: string) => {
    await Promise.all([
      ensureDefaultRemindersJob(userId),
      ensureDefaultSoaPipelineJob(userId),
    ]);
  },
);
