import { z } from "zod";

import { protectedProcedure, router } from "@/server/trpc";

export const receiptsRouter = router({
  list: protectedProcedure.query(async ({ ctx }) => {
    const { db } = await import("@/lib/db");
    const { receipts } = await import("@/lib/db/schema");
    const { eq, desc } = await import("drizzle-orm");
    return db.query.receipts.findMany({
      where: eq(receipts.userId, ctx.user.id),
      orderBy: [desc(receipts.createdAt)],
      limit: 50,
    });
  }),

  processOcr: protectedProcedure
    .input(
      z.object({
        storagePath: z.string(),
        originalFileName: z.string().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const { db } = await import("@/lib/db");
      const { receipts } = await import("@/lib/db/schema");
      const { ocrReceipt, parseReceiptText } =
        await import("@/server/legacy/pay-credit-cards/receipt-ocr");

      const ocr = await ocrReceipt(input.storagePath);
      const parsed = parseReceiptText(ocr.text);

      const [row] = await db
        .insert(receipts)
        .values({
          userId: ctx.user.id,
          storagePath: input.storagePath,
          originalFileName: input.originalFileName,
          ocrText: ocr.text,
          ocrConfidence: String(ocr.confidence ?? ""),
          parsedCardLast4: parsed.cardLast4,
          parsedAmount:
            parsed.amount != null ? String(parsed.amount) : undefined,
          parsedAmountRaw: parsed.amountRaw,
          bankDetected: undefined,
          status: "processed",
        })
        .returning();

      return { receipt: row, parsed };
    }),
});
