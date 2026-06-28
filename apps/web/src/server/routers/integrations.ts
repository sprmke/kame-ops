import { z } from "zod";

import { protectedProcedure, router } from "@/server/trpc";
import { integrationService } from "@/server/services/integration.service";

export const integrationsRouter = router({
  list: protectedProcedure.query(({ ctx }) =>
    integrationService.list(ctx.user.id),
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

  receiptAiStatus: protectedProcedure.query(async () => {
    const { getReceiptAiSecretsStatus } =
      await import("@/server/services/receipt-validation.service");
    return getReceiptAiSecretsStatus();
  }),

  verifyReceiptAi: protectedProcedure.mutation(async () => {
    const { verifyReceiptAiIntegration } =
      await import("@/server/services/receipt-validation.service");
    return verifyReceiptAiIntegration();
  }),
});
