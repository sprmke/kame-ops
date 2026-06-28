import { z } from "zod";

import { protectedProcedure, router } from "@/server/trpc";
import { receiptService } from "@/server/services/receipt.service";

export const receiptsRouter = router({
  list: protectedProcedure.query(({ ctx }) => receiptService.list(ctx.user.id)),

  unpaidDueEntries: protectedProcedure.query(({ ctx }) =>
    receiptService.listUnpaidDueEntries(ctx.user.id),
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
      }),
    )
    .mutation(({ ctx, input }) =>
      receiptService.processUploadedReceipt(ctx.user.id, input),
    ),

  confirmMarkPaid: protectedProcedure
    .input(z.object({ receiptId: z.string().uuid() }))
    .mutation(({ ctx, input }) =>
      receiptService.markPaidFromReceiptId(ctx.user.id, input.receiptId),
    ),
});
