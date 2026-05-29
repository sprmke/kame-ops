import { z } from "zod";

import { protectedProcedure, router } from "@/server/trpc";
import { creditCardService } from "@/server/services/credit-card.service";

const bankIssuerSchema = z.enum(["metrobank", "rcbc", "bpi", "unionbank"]);

export const creditCardsRouter = router({
  list: protectedProcedure.query(({ ctx }) =>
    creditCardService.list(ctx.user.id),
  ),

  get: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .query(({ ctx, input }) =>
      creditCardService.getById(ctx.user.id, input.id),
    ),

  create: protectedProcedure
    .input(
      z.object({
        issuer: bankIssuerSchema,
        last4: z.string().length(4),
        label: z.string().optional(),
        fullPan: z.string().optional(),
        contactLine: z.string().optional(),
        pdfPassword: z.string().min(1),
        gmailMonthOffset: z.number().int().optional(),
      }),
    )
    .mutation(({ ctx, input }) => creditCardService.create(ctx.user.id, input)),

  update: protectedProcedure
    .input(
      z.object({
        id: z.string().uuid(),
        issuer: bankIssuerSchema.optional(),
        last4: z.string().length(4).optional(),
        label: z.string().optional(),
        fullPan: z.string().optional(),
        contactLine: z.string().optional(),
        pdfPassword: z.string().min(1).optional(),
        gmailMonthOffset: z.number().int().optional(),
        isActive: z.boolean().optional(),
      }),
    )
    .mutation(({ ctx, input }) => {
      const { id, ...data } = input;
      return creditCardService.update(ctx.user.id, id, data);
    }),

  delete: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .mutation(({ ctx, input }) =>
      creditCardService.softDelete(ctx.user.id, input.id),
    ),
});
