import "server-only";

import { and, eq, inArray, isNull } from "drizzle-orm";
import { TRPCError } from "@trpc/server";

import { db } from "@/lib/db";
import {
  creditCards,
  dueEntries,
  receipts,
  soaStatements,
} from "@/lib/db/schema";
import type { CreditCardReceiptAiResult } from "@/lib/receipts/types";
import {
  AI_SKIP_NO_KEYS_MESSAGE,
  isReceiptAiSkipped,
  isReceiptAiSkippedNoKeys,
  skippedReceiptAi,
} from "@/lib/receipts/ai-skip";
import { creditCardService } from "./credit-card.service";
import {
  markPaidService,
  receiptPaymentFailureMessage,
  buildReceiptConfirmationMessage,
} from "./mark-paid.service";
import { aiApiKeyService } from "./ai-api-key.service";
import {
  shouldPersistReceiptValidation,
  validateCreditCardReceiptImage,
} from "./receipt-validation.service";
import { ReceiptUploadProgressReporter } from "./receipt-upload-progress.service";
import { storageService } from "./storage.service";
import { enrichDueEntriesWithSoaPeriod } from "./due-statement-period.service";
import {
  groupAnalyzedBatchItems,
  type AnalyzedBatchGroup,
  type AnalyzedBatchItem,
  type BatchUploadItemInput,
} from "@/lib/receipts/receipt-card-group";
import { matchReceiptToDue } from "@/lib/receipts/match-due";
import {
  computeDuePaymentCoverage,
  estimatePaymentSequence,
  parseDueAmounts,
  paymentTargetDue,
  sumReceiptAmounts,
} from "@/lib/receipts/partial-payment";
import type { DuePaymentCoverage } from "@/lib/receipts/partial-payment";

function mimeFromPath(path: string): string {
  const ext = path.split(".").pop()?.toLowerCase();
  if (ext === "pdf") return "application/pdf";
  if (ext === "png") return "image/png";
  if (ext === "webp") return "image/webp";
  if (ext === "gif") return "image/gif";
  return "image/jpeg";
}

type ReceiptValidationRow = {
  aiVerdict: string | null;
  aiSummary: string | null;
  aiAnalysis: {
    confidence?: number | null;
    hasAmount?: boolean;
    hasDate?: boolean;
    hasReference?: boolean;
    isCreditCardPayment?: boolean;
    paymentDate?: string;
    referenceNumber?: string;
    aiModelError?: string;
  } | null;
};

function shouldApplyRevalidationResult(
  ai: CreditCardReceiptAiResult,
  row: ReceiptValidationRow,
): boolean {
  if (!shouldPersistReceiptValidation(ai)) return false;
  if (
    ai.verdict === "skipped" &&
    row.aiVerdict &&
    row.aiVerdict !== "skipped"
  ) {
    return false;
  }
  return true;
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
        cumulativePaid: number;
        coverage: DuePaymentCoverage;
        paymentSequenceLabel: string;
        thresholdMet: boolean;
        belowTotalDue: boolean;
        remindersSuppressed?: number;
      }
    | {
        ok: false;
        reason: string;
        code: string;
      };
};

async function syncReceiptStatusesForDueEntry(
  userId: string,
  dueEntryId: string,
  thresholdMet: boolean,
) {
  const nextStatus = thresholdMet ? "marked_paid" : "partial";
  await db
    .update(receipts)
    .set({ paymentStatus: nextStatus, dueEntryId })
    .where(
      and(
        eq(receipts.userId, userId),
        eq(receipts.dueEntryId, dueEntryId),
        inArray(receipts.paymentStatus, ["pending", "partial", "marked_paid"]),
      ),
    );
}

function buildDuePaymentSummaries(
  rows: ReceiptRow[],
  dueById: Map<string, typeof dueEntries.$inferSelect>,
) {
  const amountsByDue = new Map<string, number[]>();

  for (const row of rows) {
    if (!row.dueEntryId || row.paymentStatus === "rejected") continue;
    const amount =
      row.parsedAmount != null
        ? Number(row.parsedAmount)
        : row.parsedAmountRaw
          ? Number(row.parsedAmountRaw.replace(/[^\d.-]/g, ""))
          : NaN;
    if (!Number.isFinite(amount) || amount <= 0) continue;
    const list = amountsByDue.get(row.dueEntryId) ?? [];
    list.push(amount);
    amountsByDue.set(row.dueEntryId, list);
  }

  const summaryByDue = new Map<
    string,
    {
      cumulativePaidForDue: number;
      duePaymentCoverage: DuePaymentCoverage;
      paymentSequenceLabel: string;
      receiptCountForDue: number;
    }
  >();

  for (const [dueEntryId, amounts] of amountsByDue) {
    const due = dueById.get(dueEntryId);
    if (!due) continue;
    const cumulativePaidForDue = sumReceiptAmounts(amounts);
    const { minimumDueValue, totalDueValue } = parseDueAmounts(due);
    const duePaymentCoverage = computeDuePaymentCoverage(
      cumulativePaidForDue,
      minimumDueValue,
      totalDueValue,
    );
    const targetDue = paymentTargetDue(minimumDueValue, totalDueValue);
    const paymentSequence = estimatePaymentSequence(amounts, targetDue);
    summaryByDue.set(dueEntryId, {
      cumulativePaidForDue,
      duePaymentCoverage,
      paymentSequenceLabel: paymentSequence.label,
      receiptCountForDue: amounts.length,
    });
  }

  return summaryByDue;
}

type ReceiptRow = typeof receipts.$inferSelect;

function dueStatementKey(
  issuerId: string,
  cardLast4: string,
  dueDateYmd: string,
): string {
  return `${issuerId}:${cardLast4}:${dueDateYmd}`;
}

async function loadStatementDateByDueKey(userId: string) {
  const rows = await db.query.soaStatements.findMany({
    where: eq(soaStatements.userId, userId),
    columns: {
      issuerId: true,
      cardLast4: true,
      dueDateYmd: true,
      statementDate: true,
    },
  });

  const map = new Map<string, string>();
  for (const row of rows) {
    if (!row.dueDateYmd || !row.statementDate || row.statementDate === "—") {
      continue;
    }
    map.set(
      dueStatementKey(row.issuerId, row.cardLast4, row.dueDateYmd),
      row.statementDate,
    );
  }
  return map;
}

export const receiptService = {
  async list(userId: string, limit = 100) {
    const rows = await db.query.receipts.findMany({
      where: eq(receipts.userId, userId),
      orderBy: (t, { desc }) => [desc(t.createdAt)],
      limit,
    });

    const dueEntryIds = rows
      .map((row) => row.dueEntryId)
      .filter((id): id is string => Boolean(id));

    const [linkedDues, allDues] = await Promise.all([
      dueEntryIds.length > 0
        ? db.query.dueEntries.findMany({
            where: and(
              eq(dueEntries.userId, userId),
              inArray(dueEntries.id, dueEntryIds),
            ),
          })
        : Promise.resolve([]),
      db.query.dueEntries.findMany({
        where: eq(dueEntries.userId, userId),
        orderBy: (t, { asc }) => [asc(t.dueDateYmd)],
      }),
    ]);

    const enrichedDues = await enrichDueEntriesWithSoaPeriod(userId, allDues);
    const enrichedById = new Map(enrichedDues.map((row) => [row.id, row]));
    const dueCandidates = enrichedDues.map((row) => ({
      id: row.id,
      issuerId: row.issuerId,
      cardLast4: row.cardLast4,
      dueDateYmd: row.dueDateYmd,
      statementPeriodKey: row.statementPeriodKey,
      statementPeriodLabel: row.statementPeriodLabel,
    }));

    const dueById = new Map(enrichedDues.map((row) => [row.id, row]));
    const statementDateByDueKey = await loadStatementDateByDueKey(userId);
    const duePaymentSummaries = buildDuePaymentSummaries(rows, dueById);

    return rows.map((row) => {
      const linked = row.dueEntryId ? dueById.get(row.dueEntryId) : undefined;
      const matchedCandidate = matchReceiptToDue(dueCandidates, {
        dueEntryId: linked?.id ?? row.dueEntryId,
        parsedCardLast4: row.parsedCardLast4,
        dueDateYmd: linked?.dueDateYmd ?? null,
        aiAnalysis: row.aiAnalysis as
          | { paymentDate?: string }
          | null
          | undefined,
        createdAt: row.createdAt,
      });
      const due = matchedCandidate
        ? enrichedById.get(matchedCandidate.id)
        : undefined;
      const statementDate =
        due &&
        statementDateByDueKey.get(
          dueStatementKey(due.issuerId, due.cardLast4, due.dueDateYmd),
        );

      const dueSummary = due?.id ? duePaymentSummaries.get(due.id) : undefined;

      return {
        ...row,
        parsedAmount: row.parsedAmount ? Number(row.parsedAmount) : null,
        cardDisplayLabel: due?.cardDisplayLabel ?? null,
        bankLabel: due?.bankLabel ?? null,
        dueEntryId: due?.id ?? row.dueEntryId ?? null,
        dueDateYmd: due?.dueDateYmd ?? null,
        statementDate: statementDate ?? null,
        statementPeriodKey: due?.statementPeriodKey ?? null,
        statementPeriodLabel: due?.statementPeriodLabel ?? null,
        minimumDue: due?.minimumDue ?? null,
        totalDue: due?.totalDue ?? null,
        cumulativePaidForDue: dueSummary?.cumulativePaidForDue ?? null,
        duePaymentCoverage: dueSummary?.duePaymentCoverage ?? null,
        paymentSequenceLabel: dueSummary?.paymentSequenceLabel ?? null,
        receiptCountForDue: dueSummary?.receiptCountForDue ?? null,
      };
    });
  },

  async getForUser(userId: string, receiptId: string) {
    return db.query.receipts.findFirst({
      where: and(eq(receipts.id, receiptId), eq(receipts.userId, userId)),
    });
  },

  async delete(userId: string, receiptId: string) {
    const row = await this.getForUser(userId, receiptId);
    if (!row) {
      throw new TRPCError({ code: "NOT_FOUND", message: "Receipt not found" });
    }

    if (row.dueEntryId) {
      await db
        .update(dueEntries)
        .set({ receiptId: null })
        .where(
          and(
            eq(dueEntries.id, row.dueEntryId),
            eq(dueEntries.userId, userId),
            eq(dueEntries.receiptId, receiptId),
          ),
        );
    }

    await storageService.deletePrivate(row.storagePath);
    await db
      .delete(receipts)
      .where(and(eq(receipts.id, receiptId), eq(receipts.userId, userId)));

    return { ok: true as const };
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
      processId?: string;
      prefetchedAi?: CreditCardReceiptAiResult;
      skipPrepare?: boolean;
      batchMeta?: { index: number; total: number; isLast: boolean };
    },
  ): Promise<ReceiptProcessResult> {
    let reporter: ReceiptUploadProgressReporter | null = null;
    if (input.processId) {
      reporter =
        (await ReceiptUploadProgressReporter.resume(userId, input.processId)) ??
        null;
      if (reporter && !input.skipPrepare) {
        await reporter.activate("prepare", "Loading your cards");
      }
    }

    const buffer = await storageService.readPrivate(input.storagePath);
    if (!buffer?.length) {
      await reporter?.fail("Could not read uploaded receipt");
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
        await reporter?.fail("Due entry not found");
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

    if (!input.skipPrepare) {
      await reporter?.completeStep("prepare");
    }

    const mimeType = mimeFromPath(input.originalFileName ?? input.storagePath);
    const batchLabel = input.batchMeta
      ? `Receipt ${input.batchMeta.index}/${input.batchMeta.total}`
      : null;

    if (!(await aiApiKeyService.hasConfiguredKeys(userId))) {
      const ai = skippedReceiptAi(AI_SKIP_NO_KEYS_MESSAGE, "no_keys");
      await reporter?.completeStep("validate");
      await reporter?.activate("save", "Saving receipt details");

      const [receiptRow] = await db
        .insert(receipts)
        .values({
          userId,
          storagePath: input.storagePath,
          originalFileName: input.originalFileName,
          aiVerdict: ai.verdict,
          aiSummary: ai.summary,
          paymentStatus: "pending",
          status: "processed",
        })
        .returning();

      await reporter?.complete();
      return {
        receipt: receiptRow!,
        ai,
        payment: {
          ok: false,
          reason: AI_SKIP_NO_KEYS_MESSAGE,
          code: "ai_skipped_no_keys",
        },
      };
    }

    let ai: CreditCardReceiptAiResult;
    if (input.prefetchedAi) {
      ai = input.prefetchedAi;
      await reporter?.activate(
        "validate",
        batchLabel ?? "Using analyzed receipt data",
      );
      await reporter?.completeStep("validate");
    } else {
      await reporter?.activate("validate", "Analyzing receipt with AI");
      ai = await validateCreditCardReceiptImage(userId, buffer, mimeType, {
        knownCards,
        dueContext,
      });
      await reporter?.completeStep("validate");
    }
    await reporter?.activate(
      "save",
      batchLabel ? `${batchLabel} — saving` : "Saving receipt details",
    );

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

    await reporter?.completeStep("save");

    if (isReceiptAiSkipped(ai)) {
      if (!input.batchMeta || input.batchMeta.isLast) {
        await reporter?.complete();
      }
      return {
        receipt: receiptRow!,
        ai,
        payment: {
          ok: false,
          reason: ai.summary,
          code: isReceiptAiSkippedNoKeys(ai)
            ? "ai_skipped_no_keys"
            : "validate_only",
        },
      };
    }

    if (ai.aiModelError) {
      await reporter?.fail(ai.aiModelError);
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
      await reporter?.fail("Receipt does not look like payment proof");
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
      if (!input.batchMeta || input.batchMeta.isLast) {
        await reporter?.complete();
      }
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

    const parsed = aiToParsedReceipt(ai);
    const matchDetail =
      parsed.cardLast4 != null
        ? `Card •••• ${parsed.cardLast4}`
        : "Matching payment to due date";
    await reporter?.activate("mark_paid", matchDetail);
    const payResult = await markPaidService.markFromReceipt(userId, parsed, {
      caption: input.caption,
      dueEntryId: input.dueEntryId,
      excludeReceiptId: receiptRow!.id,
    });

    if (!payResult.ok) {
      await db
        .update(receipts)
        .set({ paymentStatus: "rejected" })
        .where(eq(receipts.id, receiptRow!.id));

      await reporter?.fail(receiptPaymentFailureMessage(payResult));
      return {
        receipt: receiptRow!,
        ai,
        payment: {
          ok: false,
          reason: receiptPaymentFailureMessage(payResult),
          code: payResult.reason,
        },
      };
    }

    await reporter?.completeStep("mark_paid");

    const receiptPaymentStatus = payResult.thresholdMet ? "marked_paid" : "partial";

    await db
      .update(receipts)
      .set({
        paymentStatus: receiptPaymentStatus,
        dueEntryId: payResult.entry.id,
      })
      .where(eq(receipts.id, receiptRow!.id));

    await syncReceiptStatusesForDueEntry(
      userId,
      payResult.entry.id,
      payResult.thresholdMet,
    );

    if (!payResult.thresholdMet) {
      await reporter?.activate(
        "mark_paid",
        `Partial ${payResult.paymentSequence.label} · ${payResult.coverage === "partial" ? "below minimum due" : "recorded"}`,
      );
      await reporter?.skipRemaining("reminders");
      if (input.batchMeta && !input.batchMeta.isLast) {
        await reporter?.resetSteps([
          "mark_paid",
          "reminders",
          "calendar",
          "sync",
        ]);
      } else {
        await reporter?.complete();
      }
    } else {
      await reporter?.activate(
        "reminders",
        payResult.remindersSuppressed > 0
          ? `${payResult.remindersSuppressed} reminder(s) silenced`
          : "Updating reminder status",
      );
      await reporter?.completeStep("reminders");

      const snapshot = reporter?.snapshot();
      const hasCalendarStep = snapshot?.steps.some((s) => s.id === "calendar");
      if (hasCalendarStep) {
        await reporter?.activate(
          "calendar",
          payResult.calendarUpdated > 0
            ? `${payResult.calendarUpdated} event(s) updated`
            : "Checking calendar events",
        );
        await reporter?.completeStep("calendar");
      }

      await db
        .update(dueEntries)
        .set({ receiptId: receiptRow!.id })
        .where(eq(dueEntries.id, payResult.entry.id));

      await reporter?.activate("sync", "Saving");
      await reporter?.completeStep("sync");
      if (!input.batchMeta || input.batchMeta.isLast) {
        await reporter?.complete();
      } else {
        await reporter?.resetSteps([
          "mark_paid",
          "reminders",
          "calendar",
          "sync",
        ]);
      }
    }

    const updatedReceipt = await db.query.receipts.findFirst({
      where: eq(receipts.id, receiptRow!.id),
    });

    return {
      receipt: updatedReceipt ?? receiptRow!,
      ai,
      payment: {
        ok: true,
        dueEntryId: payResult.entry.id,
        amountPaid: payResult.amountPaid,
        cumulativePaid: payResult.cumulativePaid,
        coverage: payResult.coverage,
        paymentSequenceLabel: payResult.paymentSequence.label,
        thresholdMet: payResult.thresholdMet,
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
    if (row.paymentStatus === "partial") {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: "Receipt already recorded as a partial payment",
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

    const payResult = await markPaidService.markFromReceipt(
      userId,
      aiToParsedReceipt(ai),
      {
        dueEntryId: row.dueEntryId ?? undefined,
        excludeReceiptId: row.id,
      },
    );
    if (!payResult.ok) {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: receiptPaymentFailureMessage(payResult),
      });
    }

    await db
      .update(receipts)
      .set({
        paymentStatus: payResult.thresholdMet ? "marked_paid" : "partial",
        dueEntryId: payResult.entry.id,
      })
      .where(eq(receipts.id, row.id));

    await syncReceiptStatusesForDueEntry(
      userId,
      payResult.entry.id,
      payResult.thresholdMet,
    );

    if (payResult.thresholdMet) {
      await db
        .update(dueEntries)
        .set({ receiptId: row.id })
        .where(eq(dueEntries.id, payResult.entry.id));
    }

    return { ok: true as const, dueEntryId: payResult.entry.id };
  },

  async revalidateWithAi(userId: string, receiptId: string) {
    const row = await db.query.receipts.findFirst({
      where: and(eq(receipts.id, receiptId), eq(receipts.userId, userId)),
    });
    if (!row) {
      throw new TRPCError({ code: "NOT_FOUND", message: "Receipt not found" });
    }

    if (!(await aiApiKeyService.hasConfiguredKeys(userId))) {
      const ai = skippedReceiptAi(AI_SKIP_NO_KEYS_MESSAGE, "no_keys");
      return {
        receipt: row,
        ai,
        paymentStatus: row.paymentStatus ?? "pending",
      };
    }

    const buffer = await storageService.readPrivate(row.storagePath);
    if (!buffer?.length) {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: "Could not read receipt file",
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

    if (row.dueEntryId) {
      const due = await db.query.dueEntries.findFirst({
        where: and(
          eq(dueEntries.id, row.dueEntryId),
          eq(dueEntries.userId, userId),
        ),
      });
      if (due) {
        dueContext = {
          cardLast4: due.cardLast4,
          issuerId: due.issuerId,
          bankLabel: due.bankLabel,
          dueDateYmd: due.dueDateYmd,
          minimumDue: due.minimumDue,
          totalDue: due.totalDue,
        };
      }
    } else {
      const allDues = await db.query.dueEntries.findMany({
        where: eq(dueEntries.userId, userId),
        orderBy: (t, { asc }) => [asc(t.dueDateYmd)],
      });
      const enrichedDues = await enrichDueEntriesWithSoaPeriod(userId, allDues);
      const matched = matchReceiptToDue(
        enrichedDues.map((due) => ({
          id: due.id,
          issuerId: due.issuerId,
          cardLast4: due.cardLast4,
          dueDateYmd: due.dueDateYmd,
          statementPeriodKey: due.statementPeriodKey,
          statementPeriodLabel: due.statementPeriodLabel,
        })),
        {
          dueEntryId: row.dueEntryId,
          parsedCardLast4: row.parsedCardLast4,
          dueDateYmd: null,
          aiAnalysis: row.aiAnalysis as
            | { paymentDate?: string }
            | null
            | undefined,
          createdAt: row.createdAt,
        },
      );
      const fullDue = matched
        ? enrichedDues.find((due) => due.id === matched.id)
        : undefined;
      if (fullDue) {
        dueContext = {
          cardLast4: fullDue.cardLast4,
          issuerId: fullDue.issuerId,
          bankLabel: fullDue.bankLabel,
          dueDateYmd: fullDue.dueDateYmd,
          minimumDue: fullDue.minimumDue,
          totalDue: fullDue.totalDue,
        };
      }
    }

    const mimeType = mimeFromPath(row.originalFileName ?? row.storagePath);
    const ai = await validateCreditCardReceiptImage(userId, buffer, mimeType, {
      knownCards,
      dueContext,
    });

    if (isReceiptAiSkippedNoKeys(ai)) {
      return {
        receipt: row,
        ai,
        paymentStatus: row.paymentStatus ?? "pending",
      };
    }

    const extraction = ai.extraction;
    const preserveMarkedPaid = row.paymentStatus === "marked_paid";
    const applyValidation = shouldApplyRevalidationResult(ai, row);
    const paymentStatus = preserveMarkedPaid
      ? "marked_paid"
      : applyValidation
        ? ai.verdict === "invalid"
          ? "rejected"
          : "pending"
        : (row.paymentStatus ?? "pending");

    const nextAiAnalysis = applyValidation
      ? {
          confidence: ai.confidence,
          hasAmount: ai.hasAmount,
          hasDate: ai.hasDate,
          hasReference: ai.hasReference,
          isCreditCardPayment: ai.isCreditCardPayment,
          paymentDate: extraction.paymentDate,
          referenceNumber: extraction.referenceNumber,
          aiModelError: ai.aiModelError,
        }
      : {
          ...(row.aiAnalysis ?? {}),
          aiModelError: ai.aiModelError ?? row.aiAnalysis?.aiModelError,
        };

    const [updated] = await db
      .update(receipts)
      .set({
        parsedCardLast4: applyValidation
          ? extraction.cardLast4
          : row.parsedCardLast4,
        parsedAmount: applyValidation
          ? extraction.amount != null
            ? String(extraction.amount)
            : null
          : row.parsedAmount,
        parsedAmountRaw: applyValidation
          ? extraction.amountRaw
          : row.parsedAmountRaw,
        bankDetected: applyValidation
          ? extraction.bankOrWallet
          : row.bankDetected,
        aiVerdict: applyValidation ? ai.verdict : row.aiVerdict,
        aiSummary: applyValidation ? ai.summary : row.aiSummary,
        aiProvider: applyValidation ? ai.provider : row.aiProvider,
        aiAnalysis: nextAiAnalysis,
        paymentStatus,
        status:
          ai.aiModelError && !applyValidation
            ? row.status
            : ai.aiModelError
              ? "error"
              : "processed",
      })
      .where(and(eq(receipts.id, receiptId), eq(receipts.userId, userId)))
      .returning();

    if (!updated) {
      throw new TRPCError({ code: "NOT_FOUND", message: "Receipt not found" });
    }

    return {
      receipt: updated,
      ai,
      paymentStatus,
    };
  },

  async analyzeUploadBatch(
    userId: string,
    input: {
      items: BatchUploadItemInput[];
      dueEntryId?: string;
    },
  ): Promise<{ groups: AnalyzedBatchGroup[] }> {
    if (input.items.length === 0) {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: "No receipts to analyze",
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
    let forcedLabel: string | undefined;

    if (input.dueEntryId) {
      const targetDueEntry = await db.query.dueEntries.findFirst({
        where: and(
          eq(dueEntries.id, input.dueEntryId),
          eq(dueEntries.userId, userId),
        ),
      });
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
      forcedLabel =
        targetDueEntry.cardDisplayLabel ??
        `${targetDueEntry.bankLabel} ·••• ${targetDueEntry.cardLast4}`;
    }

    const analyzed: AnalyzedBatchItem[] = [];

    for (const item of input.items) {
      const buffer = await storageService.readPrivate(item.storagePath);
      if (!buffer?.length) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `Could not read ${item.originalFileName ?? "receipt"}`,
        });
      }

      const mimeType = mimeFromPath(item.originalFileName ?? item.storagePath);

      if (!(await aiApiKeyService.hasConfiguredKeys(userId))) {
        analyzed.push({
          ...item,
          ai: skippedReceiptAi(AI_SKIP_NO_KEYS_MESSAGE, "no_keys"),
        });
        continue;
      }

      const ai = await validateCreditCardReceiptImage(userId, buffer, mimeType, {
        knownCards,
        dueContext,
      });

      analyzed.push({ ...item, ai });
    }

    const groups = groupAnalyzedBatchItems(analyzed, knownCards, {
      forcedDueEntryId: input.dueEntryId,
      forcedLabel,
    });

    return { groups };
  },

  async processUploadBatch(
    userId: string,
    input: {
      groups: Array<{
        processId: string;
        cardLabel: string;
        items: AnalyzedBatchItem[];
      }>;
      dueEntryId?: string;
      markPaid?: boolean;
      updateCalendar?: boolean;
    },
  ) {
    const results: Array<{
      processId: string;
      cardLabel: string;
      receiptCount: number;
      receipts: ReceiptProcessResult[];
    }> = [];

    for (const group of input.groups) {
      await ReceiptUploadProgressReporter.create(userId, group.processId, {
        markPaid: input.markPaid !== false,
        updateCalendar: input.updateCalendar ?? false,
      });

      const groupResults: ReceiptProcessResult[] = [];

      for (let i = 0; i < group.items.length; i++) {
        const item = group.items[i]!;
        const result = await this.processUploadedReceipt(userId, {
          storagePath: item.storagePath,
          originalFileName: item.originalFileName,
          dueEntryId: input.dueEntryId,
          markPaid: input.markPaid,
          processId: group.processId,
          prefetchedAi: item.ai,
          skipPrepare: i > 0,
          batchMeta: {
            index: i + 1,
            total: group.items.length,
            isLast: i === group.items.length - 1,
          },
        });
        groupResults.push(result);
      }

      results.push({
        processId: group.processId,
        cardLabel: group.cardLabel,
        receiptCount: group.items.length,
        receipts: groupResults,
      });
    }

    return { groups: results };
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

    const ai = await validateCreditCardReceiptImage(
      userId,
      imageBytes,
      mimeType,
      {
        knownCards,
      },
    );

    if (isReceiptAiSkipped(ai)) {
      return {
        ai,
        payResult: null,
        message: ai.summary,
      };
    }

    if (ai.aiModelError) {
      return { ai, payResult: null, error: ai.aiModelError };
    }

    const payResult = await markPaidService.markFromReceipt(
      userId,
      aiToParsedReceipt(ai),
      { caption },
    );

    return {
      ai,
      payResult,
      message: buildReceiptConfirmationMessage(payResult),
    };
  },
};
