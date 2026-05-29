import { z } from "zod";

import { protectedProcedure, router } from "@/server/trpc";
import { integrationService } from "@/server/services/integration.service";

export const integrationsRouter = router({
  list: protectedProcedure.query(({ ctx }) =>
    integrationService.list(ctx.user.id),
  ),

  upsert: protectedProcedure
    .input(
      z.object({
        provider: z.enum(["gmail", "google_calendar", "telegram", "slack"]),
        config: z.record(z.string()),
        isActive: z.boolean().optional(),
      }),
    )
    .mutation(({ ctx, input }) =>
      integrationService.upsert(ctx.user.id, input),
    ),
});
