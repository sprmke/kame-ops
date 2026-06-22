import { z } from "zod";

import {
  TRANSACTION_CATEGORY_OPTIONS,
  TRANSACTION_CATEGORY_SLUGS,
} from "@/lib/transactions/categories";
import { protectedProcedure, router } from "@/server/trpc";
import { transactionCategoryService } from "@/server/services/transaction-category.service";

const categorySlugSchema = z.enum(
  TRANSACTION_CATEGORY_SLUGS as [
    (typeof TRANSACTION_CATEGORY_SLUGS)[number],
    ...(typeof TRANSACTION_CATEGORY_SLUGS)[number][],
  ],
);

export const transactionCategoriesRouter = router({
  listOptions: protectedProcedure.query(() => TRANSACTION_CATEGORY_OPTIONS),

  listRules: protectedProcedure.query(({ ctx }) =>
    transactionCategoryService.listRules(ctx.user.id),
  ),

  createRule: protectedProcedure
    .input(
      z.object({
        keyword: z.string().min(2).max(128),
        categorySlug: categorySlugSchema,
        priority: z.number().int().min(0).max(1000).optional(),
      }),
    )
    .mutation(({ ctx, input }) =>
      transactionCategoryService.createRule(ctx.user.id, {
        ...input,
        source: "user",
      }),
    ),

  updateRule: protectedProcedure
    .input(
      z.object({
        ruleId: z.string().uuid(),
        keyword: z.string().min(2).max(128).optional(),
        categorySlug: categorySlugSchema.optional(),
        priority: z.number().int().min(0).max(1000).optional(),
      }),
    )
    .mutation(({ ctx, input }) => {
      const { ruleId, ...data } = input;
      return transactionCategoryService.updateRule(ctx.user.id, ruleId, data);
    }),

  deleteRule: protectedProcedure
    .input(z.object({ ruleId: z.string().uuid() }))
    .mutation(({ ctx, input }) =>
      transactionCategoryService.deleteRule(ctx.user.id, input.ruleId),
    ),

  updateTransactionCategory: protectedProcedure
    .input(
      z.object({
        transactionId: z.string().uuid(),
        categorySlug: categorySlugSchema,
        learn: z.boolean().optional(),
      }),
    )
    .mutation(({ ctx, input }) =>
      transactionCategoryService.updateTransactionCategory(
        ctx.user.id,
        input.transactionId,
        input,
      ),
    ),
});
