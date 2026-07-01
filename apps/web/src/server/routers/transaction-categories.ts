import { z } from "zod";

import { protectedProcedure, router } from "@/server/trpc";
import { aiCategorizeProgressService } from "@/server/services/ai-categorize-progress.service";
import { transactionCategoryAiService } from "@/server/services/transaction-category-ai.service";
import { transactionCategoryService } from "@/server/services/transaction-category.service";

const categorySlugInput = z.string().min(1).max(32);
const processIdInput = z.string().uuid().optional();

export const transactionCategoriesRouter = router({
  listOptions: protectedProcedure.query(({ ctx }) =>
    transactionCategoryService.listOptions(ctx.user.id),
  ),

  listUserCategories: protectedProcedure.query(({ ctx }) =>
    transactionCategoryService.listUserCategories(ctx.user.id),
  ),

  createCategory: protectedProcedure
    .input(z.object({ label: z.string().min(2).max(64) }))
    .mutation(({ ctx, input }) =>
      transactionCategoryService.createCategory(ctx.user.id, input.label),
    ),

  deleteCategory: protectedProcedure
    .input(z.object({ slug: categorySlugInput }))
    .mutation(({ ctx, input }) =>
      transactionCategoryService.deleteCategory(ctx.user.id, input.slug),
    ),

  listRules: protectedProcedure.query(({ ctx }) =>
    transactionCategoryService.listRules(ctx.user.id),
  ),

  createRule: protectedProcedure
    .input(
      z.object({
        keyword: z.string().min(2).max(128),
        categorySlug: categorySlugInput,
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
        categorySlug: categorySlugInput.optional(),
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
        categorySlug: categorySlugInput,
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

  categorizeStatementWithAi: protectedProcedure
    .input(
      z.object({
        statementId: z.string().uuid(),
        scope: z.enum(["all", "unknown_only"]),
        processId: processIdInput,
      }),
    )
    .mutation(({ ctx, input }) =>
      transactionCategoryAiService.categorizeStatementWithAi(
        ctx.user.id,
        input.statementId,
        input.scope,
        input.processId,
      ),
    ),

  categorizePeriodWithAi: protectedProcedure
    .input(
      z.object({
        periodId: z.string().uuid(),
        scope: z.enum(["all", "unknown_only"]),
        processId: processIdInput,
      }),
    )
    .mutation(({ ctx, input }) =>
      transactionCategoryAiService.categorizePeriodWithAi(
        ctx.user.id,
        input.periodId,
        input.scope,
        input.processId,
      ),
    ),

  getCategorizeProgress: protectedProcedure
    .input(z.object({ processId: z.string().uuid() }))
    .query(({ ctx, input }) =>
      aiCategorizeProgressService.getSnapshot(ctx.user.id, input.processId),
    ),
});
