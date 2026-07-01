import { z } from "zod";

import { protectedProcedure, router } from "@/server/trpc";
import {
  automationService,
  scheduleInputSchema,
} from "@/server/services/automation.service";
import { reminderRunProgressService } from "@/server/services/reminder-run-progress.service";
import { soaRunProgressService } from "@/server/services/soa-run-progress.service";

const automationJobTypeSchema = z.enum([
  "send_due_reminders",
  "run_soa_pipeline",
]);

export const automationsRouter = router({
  list: protectedProcedure.query(({ ctx }) =>
    automationService.list(ctx.user.id),
  ),

  create: protectedProcedure
    .input(
      z.object({
        name: z.string().min(1),
        description: z.string().optional(),
        schedule: scheduleInputSchema,
        jobType: automationJobTypeSchema,
        config: z.record(z.unknown()).optional(),
        isActive: z.boolean().optional(),
      }),
    )
    .mutation(({ ctx, input }) => automationService.create(ctx.user.id, input)),

  update: protectedProcedure
    .input(
      z.object({
        jobId: z.string().uuid(),
        name: z.string().min(1).optional(),
        description: z.string().optional(),
        schedule: scheduleInputSchema.optional(),
        jobType: automationJobTypeSchema.optional(),
        config: z.record(z.unknown()).optional(),
        isActive: z.boolean().optional(),
      }),
    )
    .mutation(({ ctx, input }) => automationService.update(ctx.user.id, input)),

  setActive: protectedProcedure
    .input(z.object({ jobId: z.string().uuid(), isActive: z.boolean() }))
    .mutation(({ ctx, input }) =>
      automationService.setActive(ctx.user.id, input.jobId, input.isActive),
    ),

  delete: protectedProcedure
    .input(z.object({ jobId: z.string().uuid() }))
    .mutation(({ ctx, input }) =>
      automationService.delete(ctx.user.id, input.jobId),
    ),

  run: protectedProcedure
    .input(
      z.object({
        jobId: z.string().uuid(),
        processId: z.string().uuid(),
      }),
    )
    .mutation(({ ctx, input }) =>
      automationService.runJob(ctx.user.id, input.jobId, input.processId),
    ),

  getRunProgress: protectedProcedure
    .input(
      z.object({
        processId: z.string().uuid(),
        jobType: automationJobTypeSchema,
      }),
    )
    .query(async ({ ctx, input }) => {
      if (input.jobType === "run_soa_pipeline") {
        const snapshot = await soaRunProgressService.getSnapshot(
          ctx.user.id,
          input.processId,
        );
        if (!snapshot) return null;
        return {
          status: snapshot.status,
          progress: snapshot.progress,
          steps: snapshot.steps,
          detail: snapshot.detail,
          error: snapshot.error,
        };
      }

      const snapshot = await reminderRunProgressService.getSnapshot(
        ctx.user.id,
        input.processId,
      );
      if (!snapshot) return null;
      return {
        status: snapshot.status,
        progress: snapshot.progress,
        steps: snapshot.steps,
        detail: snapshot.detail,
        error: snapshot.error,
      };
    }),
});
