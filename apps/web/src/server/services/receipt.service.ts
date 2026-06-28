import "server-only";

import { and, eq, isNull } from "drizzle-orm";
import { TRPCError } from "@trpc/server";

import { db } from "@/lib/db";
import { creditCards, dueEntries, receipts } from "@/lib/db/schema";
import type { CreditCardReceiptAiResult } from "@/lib/receipts/types";
import { creditCardService } from "./credit-card.service";
import { dueSyncService } from "./due-sync.service";
import { prepareLegacyRuntime } from "./legacy-runtime.service";
import {
  shouldPersistReceiptValidation,
  validateCreditCardReceiptImage,
} from "./receipt-validation.service";
import { storageService } from "./storage.service";

function mimeFromPath(path: string): string {
  const ext = path.split(".").pop()?.toLowerCase();
  if (ext === "pdf") return "application/pdf";
  if (ext === "png") return "image/png";
  if (ext === "webp") return "image/webp";
  if (ext === "gif") return "image/gif";
  return "image/jpeg";
}

function aiToParsedReceipt(ai: CreditCardReceiptAiResult) {
  const { extraction } = ai;
  return {
    cardLast4: extraction.cardLast4,
    amount: extraction.amount,
    amountRaw:
      extraction.amountRaw ??
      (extraction.amount != null ? String(extraction.amount) : undefined),
    rawExcerpt: ai.summary,
  };
}

export type ReceiptProcessResult = {
  receipt: typeof receipts.$inferSelect;
  ai: CreditCardReceiptAiResult;
  payment:
    | {
        ok: true;
        dueEntryId: string;
        amountPaid: number;
        belowTotalDue: boolean;
        remindersSuppressed?: number;
      }
    | {
        ok: false;
        reason: string;
        code: string;
      };
};

export const receiptService = {
  async list(userId: string, limit = 50) {
    return db.query.receipts.findMany({
      where: eq(receipts.userId, userId),
      orderBy: (t, { desc }) => [desc(t.createdAt)],
      limit,
    });
  },

  async listUnpaidDueEntries(userId: string) {
    const rows = await db.query.dueEntries.findMany({
      where: and(eq(dueEntries.userId, userId), isNull(dueEntries.paidAt)),
      orderBy: (t, { asc }) => [asc(t.dueDateYmd)],
    });
    return rows;
  },

  async processUploadedReceipt(
    userId: string,
    input: {
      storagePath: string;
      originalFileName?: string;
      dueEntryId?: string;
      caption?: string;
      markPaid?: boolean;
    },
  ): Promise<ReceiptProcessResult> {
    const buffer = await storageService.readPrivate(input.storagePath);
    if (!buffer?.length) {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: "Could not read uploaded receipt",
      });
    }

    const cards = await creditCardService.list(userId);
    const knownCards = cards.map((c) => ({
      last4: c.last4,
      issuerId: c.issuer,
      bankLabel: c.issuer,
      displayLabel: c.label,
    }));

    let dueContext:
      | {
          cardLast4: string;
          issuerId: string;
          bankLabel: string;
          dueDateYmd: string;
          minimumDue: string;
          totalDue: string;
        }
      | undefined;

    let targetDueEntry: typeof dueEntries.$inferSelect | undefined;
    if (input.dueEntryId) {
      targetDueEntry =
        (await db.query.dueEntries.findFirst({
          where: and(
            eq(dueEntries.id, input.dueEntryId),
            eq(dueEntries.userId, userId),
          ),
        })) ?? undefined;
      if (!targetDueEntry) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Due entry not found",
        });
      }
      dueContext = {
        cardLast4: targetDueEntry.cardLast4,
        issuerId: targetDueEntry.issuerId,
        bankLabel: targetDueEntry.bankLabel,
        dueDateYmd: targetDueEntry.dueDateYmd,
        minimumDue: targetDueEntry.minimumDue,
        totalDue: targetDueEntry.totalDue,
      };
    }

    const mimeType = mimeFromPath(input.originalFileName ?? input.storagePath);
    const ai = await validateCreditCardReceiptImage(buffer, mimeType, {
      knownCards,
      dueContext,
    });

    const extraction = ai.extraction;
    const paymentStatus = ai.aiModelError ? "ai_error" : "pending";

    const [receiptRow] = await db
      .insert(receipts)
      .values({
        userId,
        storagePath: input.storagePath,
        originalFileName: input.originalFileName,
        parsedCardLast4: extraction.cardLast4,
        parsedAmount:
          extraction.amount != null ? String(extraction.amount) : undefined,
        parsedAmountRaw: extraction.amountRaw,
        bankDetected: extraction.bankOrWallet,
        aiVerdict: shouldPersistReceiptValidation(ai) ? ai.verdict : undefined,
        aiSummary: shouldPersistReceiptValidation(ai) ? ai.summary : undefined,
        aiProvider: ai.provider,
        aiAnalysis: {
          confidence: ai.confidence,
          hasAmount: ai.hasAmount,
          hasDate: ai.hasDate,
          hasReference: ai.hasReference,
          isCreditCardPayment: ai.isCreditCardPayment,
          paymentDate: extraction.paymentDate,
          referenceNumber: extraction.referenceNumber,
          aiModelError: ai.aiModelError,
        },
        paymentStatus,
        status: ai.aiModelError ? "error" : "processed",
      })
      .returning();

    if (ai.aiModelError) {
      return {
        receipt: receiptRow!,
        ai,
        payment: {
          ok: false,
          reason: ai.aiModelError,
          code: "ai_error",
        },
      };
    }

    if (ai.verdict === "invalid") {
      await db
        .update(receipts)
        .set({ paymentStatus: "rejected" })
        .where(eq(receipts.id, receiptRow!.id));
      return {
        receipt: receiptRow!,
        ai,
        payment: {
          ok: false,
          reason: "Receipt does not look like payment proof",
          code: "invalid_receipt",
        },
      };
    }

    if (input.markPaid === false) {
      return {
        receipt: receiptRow!,
        ai,
        payment: {
          ok: false,
          reason: "Validation only — not marked paid",
          code: "validate_only",
        },
      };
    }

    const workDir = await prepareLegacyRuntime(userId);
    const { markCardPaidFromReceipt } =
      await import("@/server/legacy/pay-credit-cards/mark-paid");

    const parsed = aiToParsedReceipt(ai);
    const payResult = await markCardPaidFromReceipt(parsed, {
      caption: input.caption,
    });

    if (!payResult.ok) {
      await db
        .update(receipts)
        .set({ paymentStatus: "rejected" })
        .where(eq(receipts.id, receiptRow!.id));

      return {
        receipt: receiptRow!,
        ai,
        payment: {
          ok: false,
          reason: paymentFailureMessage(payResult),
          code: payResult.reason,
        },
      };
    }

    const matchedEntry = await db.query.dueEntries.findFirst({
      where: and(
        eq(dueEntries.userId, userId),
        eq(dueEntries.cardLast4, payResult.entry.cardLast4),
        eq(dueEntries.dueDateYmd, payResult.entry.dueDateYMD),
      ),
    });

    if (matchedEntry) {
      await db
        .update(dueEntries)
        .set({
          paidAt: new Date(),
          paidAmount: String(payResult.amountPaid),
          receiptId: receiptRow!.id,
        })
        .where(eq(dueEntries.id, matchedEntry.id));
    }

    await db
      .update(receipts)
      .set({
        paymentStatus: "marked_paid",
        dueEntryId: matchedEntry?.id,
      })
      .where(eq(receipts.id, receiptRow!.id));

    await dueSyncService.syncFromLegacyFile(userId, workDir);

    const updatedReceipt = await db.query.receipts.findFirst({
      where: eq(receipts.id, receiptRow!.id),
    });

    return {
      receipt: updatedReceipt ?? receiptRow!,
      ai,
      payment: {
        ok: true,
        dueEntryId: matchedEntry?.id ?? "",
        amountPaid: payResult.amountPaid,
        belowTotalDue: payResult.belowTotalDue,
        remindersSuppressed: payResult.remindersSuppressed,
      },
    };
  },

  async markPaidFromReceiptId(userId: string, receiptId: string) {
    const row = await db.query.receipts.findFirst({
      where: and(eq(receipts.id, receiptId), eq(receipts.userId, userId)),
    });
    if (!row) {
      throw new TRPCError({ code: "NOT_FOUND", message: "Receipt not found" });
    }
    if (row.paymentStatus === "marked_paid") {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: "Receipt already marked paid",
      });
    }

    const ai: CreditCardReceiptAiResult = {
      verdict:
        (row.aiVerdict as CreditCardReceiptAiResult["verdict"]) ?? "unclear",
      confidence:
        typeof row.aiAnalysis?.confidence === "number"
          ? row.aiAnalysis.confidence
          : null,
      summary: row.aiSummary ?? "",
      hasAmount: Boolean(row.aiAnalysis?.hasAmount),
      hasDate: Boolean(row.aiAnalysis?.hasDate),
      hasReference: Boolean(row.aiAnalysis?.hasReference),
      isCreditCardPayment: Boolean(row.aiAnalysis?.isCreditCardPayment),
      extraction: {
        cardLast4: row.parsedCardLast4 ?? undefined,
        amount: row.parsedAmount ? Number(row.parsedAmount) : undefined,
        amountRaw: row.parsedAmountRaw ?? undefined,
        bankOrWallet: row.bankDetected ?? undefined,
      },
      provider: row.aiProvider as CreditCardReceiptAiResult["provider"],
    };

    if (ai.verdict === "invalid") {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: "Receipt failed AI validation",
      });
    }

    const workDir = await prepareLegacyRuntime(userId);
    const { markCardPaidFromReceipt } =
      await import("@/server/legacy/pay-credit-cards/mark-paid");

    const payResult = await markCardPaidFromReceipt(aiToParsedReceipt(ai));
    if (!payResult.ok) {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: paymentFailureMessage(payResult),
      });
    }

    const matchedEntry = await db.query.dueEntries.findFirst({
      where: and(
        eq(dueEntries.userId, userId),
        eq(dueEntries.cardLast4, payResult.entry.cardLast4),
        eq(dueEntries.dueDateYmd, payResult.entry.dueDateYMD),
      ),
    });

    if (matchedEntry) {
      await db
        .update(dueEntries)
        .set({
          paidAt: new Date(),
          paidAmount: String(payResult.amountPaid),
          receiptId: row.id,
        })
        .where(eq(dueEntries.id, matchedEntry.id));
    }

    await db
      .update(receipts)
      .set({
        paymentStatus: "marked_paid",
        dueEntryId: matchedEntry?.id,
      })
      .where(eq(receipts.id, row.id));

    await dueSyncService.syncFromLegacyFile(userId, workDir);

    return { ok: true as const, dueEntryId: matchedEntry?.id };
  },

  async processTelegramReceipt(
    userId: string,
    imageBytes: Buffer,
    mimeType: string,
    caption?: string,
  ) {
    const cards = await db.query.creditCards.findMany({
      where: eq(creditCards.userId, userId),
    });
    const knownCards = cards.map((c) => ({
      last4: c.last4,
      issuerId: c.issuer,
      bankLabel: c.issuer,
      displayLabel: c.label,
    }));

    const ai = await validateCreditCardReceiptImage(imageBytes, mimeType, {
      knownCards,
    });

    if (ai.aiModelError) {
      return { ai, payResult: null, error: ai.aiModelError };
    }

    await prepareLegacyRuntime(userId);
    const { markCardPaidFromReceipt, buildReceiptConfirmationMessage } =
      await import("@/server/legacy/pay-credit-cards/mark-paid");

    const payResult = await markCardPaidFromReceipt(aiToParsedReceipt(ai), {
      caption,
    });

    if (payResult.ok) {
      const workDir = process.env.DATA_DIR!;
      await dueSyncService.syncFromLegacyFile(userId, workDir);

      const matchedEntry = await db.query.dueEntries.findFirst({
        where: and(
          eq(dueEntries.userId, userId),
          eq(dueEntries.cardLast4, payResult.entry.cardLast4),
          eq(dueEntries.dueDateYmd, payResult.entry.dueDateYMD),
        ),
      });
      if (matchedEntry) {
        await db
          .update(dueEntries)
          .set({
            paidAt: new Date(),
            paidAmount: String(payResult.amountPaid),
          })
          .where(eq(dueEntries.id, matchedEntry.id));
      }
    }

    return {
      ai,
      payResult,
      message: buildReceiptConfirmationMessage(payResult),
    };
  },
};

function paymentFailureMessage(
  result: Extract<
    Awaited<
      ReturnType<
        typeof import("@/server/legacy/pay-credit-cards/mark-paid").markCardPaidFromReceipt
      >
    >,
    { ok: false }
  >,
): string {
  switch (result.reason) {
    case "no_card_detected":
      return "Card number not detected on receipt";
    case "no_amount_detected":
      return "Payment amount not detected on receipt";
    case "no_due_entry":
      return "No matching due entry — run SOA first";
    case "already_paid":
      return "This card is already marked paid";
    case "ambiguous_card":
      return "Multiple cards match — add a month caption";
    case "amount_below_minimum":
      return "Amount is below minimum due";
    default:
      return "Could not confirm payment";
  }
}
