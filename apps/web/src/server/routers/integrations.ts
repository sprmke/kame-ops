import { z } from "zod";

import { protectedProcedure, router } from "@/server/trpc";
import { gmailService } from "@/server/services/gmail.service";
import { integrationService } from "@/server/services/integration.service";

export const integrationsRouter = router({
  list: protectedProcedure.query(({ ctx }) =>
    integrationService.list(ctx.user.id),
  ),

  checkGoogleAuth: protectedProcedure.query(({ ctx }) =>
    gmailService.checkAuthStatus(ctx.user.id),
  ),

  getFormConfigs: protectedProcedure.query(({ ctx }) =>
    integrationService.getFormConfigs(ctx.user.id),
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
