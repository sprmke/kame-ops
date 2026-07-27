import { z } from "zod";

import { protectedProcedure, router } from "@/server/trpc";
import { receiptService } from "@/server/services/receipt.service";
import { receiptUploadProgressService } from "@/server/services/receipt-upload-progress.service";

const batchItemSchema = z.object({
  storagePath: z.string().min(1),
  originalFileName: z.string().optional(),
});

const analyzedBatchItemSchema = batchItemSchema.extend({
  ai: z.record(z.string(), z.unknown()),
});

export const receiptsRouter = router({
  list: protectedProcedure.query(({ ctx }) => receiptService.list(ctx.user.id)),

  unpaidDueEntries: protectedProcedure.query(({ ctx }) =>
    receiptService.listUnpaidDueEntries(ctx.user.id),
  ),

  getUploadProgress: protectedProcedure
    .input(z.object({ processId: z.string().uuid() }))
    .query(({ ctx, input }) =>
      receiptUploadProgressService.getSnapshot(ctx.user.id, input.processId),
    ),

  validateAndMarkPaid: protectedProcedure
    .input(
      z.object({
        storagePath: z.string().min(1),
        originalFileName: z.string().optional(),
        dueEntryId: z.string().uuid().optional(),
        caption: z.string().optional(),
        /** When false, only run AI validation without marking paid. */
        markPaid: z.boolean().default(true),
        processId: z.string().uuid().optional(),
      }),
    )
    .mutation(({ ctx, input }) =>
      receiptService.processUploadedReceipt(ctx.user.id, input),
    ),

  analyzeUploadBatch: protectedProcedure
    .input(
      z.object({
        items: z.array(batchItemSchema).min(1).max(20),
        dueEntryId: z.string().uuid().optional(),
      }),
    )
    .mutation(({ ctx, input }) =>
      receiptService.analyzeUploadBatch(ctx.user.id, input),
    ),

  processUploadBatch: protectedProcedure
    .input(
      z.object({
        groups: z
          .array(
            z.object({
              processId: z.string().uuid(),
              cardLabel: z.string(),
              items: z.array(analyzedBatchItemSchema).min(1),
            }),
          )
          .min(1),
        dueEntryId: z.string().uuid().optional(),
        markPaid: z.boolean().default(true),
        updateCalendar: z.boolean().default(false),
      }),
    )
    .mutation(({ ctx, input }) =>
      receiptService.processUploadBatch(ctx.user.id, {
        ...input,
        groups: input.groups.map((group) => ({
          ...group,
          items: group.items.map((item) => ({
            storagePath: item.storagePath,
            originalFileName: item.originalFileName,
            ai: item.ai as never,
          })),
        })),
      }),
    ),

  confirmMarkPaid: protectedProcedure
    .input(z.object({ receiptId: z.string().uuid() }))
    .mutation(({ ctx, input }) =>
      receiptService.markPaidFromReceiptId(ctx.user.id, input.receiptId),
    ),

  revalidateWithAi: protectedProcedure
    .input(z.object({ receiptId: z.string().uuid() }))
    .mutation(({ ctx, input }) =>
      receiptService.revalidateWithAi(ctx.user.id, input.receiptId),
    ),

  delete: protectedProcedure
    .input(z.object({ receiptId: z.string().uuid() }))
    .mutation(({ ctx, input }) =>
      receiptService.delete(ctx.user.id, input.receiptId),
    ),
});
