import { z } from "zod";

import { TRPCError } from "@trpc/server";

import { protectedProcedure, router } from "@/server/trpc";
import { creditCardService } from "@/server/services/credit-card.service";

const bankIssuerSchema = z.enum(["metrobank", "rcbc", "bpi", "unionbank"]);

const reminderFieldsSchema = {
  reminderWindowDays: z.number().int().min(0).max(60).optional().nullable(),
  reminderIntervalMinutes: z.number().int().min(60).max(1440).optional(),
  notes: z.string().optional(),
};

export const creditCardsRouter = router({
  list: protectedProcedure.query(({ ctx }) =>
    creditCardService.list(ctx.user.id),
  ),

  get: protectedProcedure
    .input(z.object({ id: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const card = await creditCardService.getForEdit(ctx.user.id, input.id);
      if (!card) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Card not found" });
      }
      return card;
    }),

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
        soaSubject: z.string().max(512).optional().nullable(),
        color: z
          .string()
          .regex(/^#[0-9A-Fa-f]{6}$/)
          .optional()
          .nullable(),
        ...reminderFieldsSchema,
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
        soaSubject: z.string().max(512).optional().nullable(),
        color: z
          .string()
          .regex(/^#[0-9A-Fa-f]{6}$/)
          .optional()
          .nullable(),
        isActive: z.boolean().optional(),
        ...reminderFieldsSchema,
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
