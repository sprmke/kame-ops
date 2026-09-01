import { z } from "zod";

import { protectedProcedure, router } from "@/server/trpc";
import { gmailService } from "@/server/services/gmail.service";
import { integrationService } from "@/server/services/integration.service";
import { ROUTES } from "@/config/routes";

export const integrationsRouter = router({
  list: protectedProcedure.query(({ ctx }) =>
    integrationService.list(ctx.user.id),
  ),

  listGoogleAccounts: protectedProcedure.query(({ ctx }) =>
    gmailService.listGoogleAccounts(ctx.user.id),
  ),

  checkGoogleAuth: protectedProcedure.query(({ ctx }) =>
    gmailService.checkAuthStatus(ctx.user.id),
  ),

  getGoogleLinkUrl: protectedProcedure
    .input(
      z.object({
        callbackUrl: z.string().optional(),
        creditCardIds: z.array(z.string().uuid()).optional(),
      }),
    )
    .mutation(({ ctx, input }) => {
      const callbackUrl = input.callbackUrl ?? ROUTES.dashboard.settings;
      return {
        url: gmailService.buildGoogleLinkUrl({
          callbackUrl,
          creditCardIds: input.creditCardIds,
        }),
      };
    }),

  disconnectGoogleAccount: protectedProcedure
    .input(z.object({ accountId: z.string().uuid() }))
    .mutation(({ ctx, input }) =>
      gmailService.disconnectGoogleAccount(ctx.user.id, input.accountId),
    ),

  updateGoogleAccountCards: protectedProcedure
    .input(
      z.object({
        accountId: z.string().uuid(),
        creditCardIds: z.array(z.string().uuid()),
      }),
    )
    .mutation(({ ctx, input }) =>
      gmailService.updateGoogleAccountCards(
        ctx.user.id,
        input.accountId,
        input.creditCardIds,
      ),
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
