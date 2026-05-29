import { and, desc, eq } from "drizzle-orm";
import { z } from "zod";

import { db } from "@/lib/db";
import { automationJobs, automationRuns } from "@/lib/db/schema";
import { reminderService } from "./reminder.service";
import { soaService } from "./soa.service";

const jobSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional(),
  schedule: z.string().min(1),
  jobType: z.enum(["poll_soa_gmail", "send_due_reminders", "run_soa_pipeline"]),
  config: z.record(z.unknown()).optional(),
  isActive: z.boolean().optional(),
});

export const automationService = {
  async list(userId: string) {
    return db.query.automationJobs.findMany({
      where: eq(automationJobs.userId, userId),
      orderBy: [desc(automationJobs.createdAt)],
      with: { runs: { limit: 5, orderBy: [desc(automationRuns.startedAt)] } },
    });
  },

  async create(userId: string, input: z.infer<typeof jobSchema>) {
    const data = jobSchema.parse(input);
    const [job] = await db
      .insert(automationJobs)
      .values({
        userId,
        name: data.name,
        description: data.description,
        schedule: data.schedule,
        jobType: data.jobType,
        config: data.config ?? {},
        isActive: data.isActive ?? true,
      })
      .returning();
    return job;
  },

  async runJob(userId: string, jobId: string) {
    const job = await db.query.automationJobs.findFirst({
      where: and(
        eq(automationJobs.id, jobId),
        eq(automationJobs.userId, userId),
      ),
    });
    if (!job) throw new Error("Job not found");

    const [run] = await db
      .insert(automationRuns)
      .values({ jobId, userId, status: "running" })
      .returning();

    if (!run) throw new Error("Failed to create automation run");

    try {
      let result: unknown;
      switch (job.jobType) {
        case "poll_soa_gmail":
          result = await soaService.pollNewSoaFromGmail(userId);
          break;
        case "send_due_reminders":
          result = await reminderService.sendDueRemindersForUser(userId);
          break;
        case "run_soa_pipeline":
          result = await soaService.runSoaPipeline(userId);
          break;
        default:
          throw new Error(`Unknown job type: ${job.jobType}`);
      }

      await db
        .update(automationRuns)
        .set({
          status: "completed",
          completedAt: new Date(),
          resultSummary: JSON.stringify(result).slice(0, 2000),
        })
        .where(eq(automationRuns.id, run.id));

      await db
        .update(automationJobs)
        .set({ lastRunAt: new Date() })
        .where(eq(automationJobs.id, jobId));

      return { runId: run.id, result };
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
  },
};
