import { z } from "zod";

import { protectedProcedure, router } from "@/server/trpc";
import { automationService } from "@/server/services/automation.service";

export const automationsRouter = router({
  list: protectedProcedure.query(({ ctx }) =>
    automationService.list(ctx.user.id),
  ),

  create: protectedProcedure
    .input(
      z.object({
        name: z.string().min(1),
        description: z.string().optional(),
        schedule: z.string().min(1),
        jobType: z.enum([
          "poll_soa_gmail",
          "send_due_reminders",
          "run_soa_pipeline",
        ]),
        config: z.record(z.unknown()).optional(),
        isActive: z.boolean().optional(),
      }),
    )
    .mutation(({ ctx, input }) => automationService.create(ctx.user.id, input)),

  run: protectedProcedure
    .input(z.object({ jobId: z.string().uuid() }))
    .mutation(({ ctx, input }) =>
      automationService.runJob(ctx.user.id, input.jobId),
    ),
});
