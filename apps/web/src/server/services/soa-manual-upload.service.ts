import "server-only";

import { randomUUID } from "crypto";
import { readFile } from "fs/promises";
import { TRPCError } from "@trpc/server";

import { and, eq } from "drizzle-orm";

import { db } from "@/lib/db";
import { soaPeriods } from "@/lib/db/schema";
import {
  isImageMime,
  isPdfMime,
  resolveAllowedUploadMime,
} from "@/lib/files/sniff-upload";
import {
  calendarMonthFromSoaDates,
  enumerateCalendarMonths,
  isValidCalendarMonth,
  normalizeSoaDisplayDate,
  type CalendarMonth,
} from "@/lib/soa/calendar-month";
import {
  bankLabelForIssuer,
  detectIssuerFromSoaText,
} from "@/lib/soa/detect-issuer";
import { alignManualUploadMonth } from "@/lib/soa/manual-upload-align";
import {
  applyMatchedCardMeta,
  identityIsAssignedToKnownCard,
  last4MatchesKnownCard,
  mergeAiIntoSoaRow,
  resolveIssuerAndLast4,
  soaRowNeedsAiFill,
} from "@/lib/soa/manual-upload-identity";
import {
  ocrDisabledForIssuer,
  ocrForcedForIssuer,
  ocrTuningForIssuer,
} from "@/lib/soa/ocr-env";
import { parseSoaText } from "@/lib/soa/parse-soa";
import { extractTransactions } from "@/lib/soa/parse-transactions";
import {
  extractPdfLinesReadingOrderDualAxis,
  tryUnlockAndExtractText,
} from "@/lib/soa/pdf";
import { ocrPdfToPlainText, parseSoaOcrPsmEnv } from "@/lib/soa/pdf-ocr";
import { formatSoaPeriodLabel } from "@/lib/soa/period";
import { privateStoragePathBelongsToUser } from "@/lib/storage/owned-path";
import {
  assessSoaTextQuality,
  pickBetterSoaText,
} from "@/lib/soa/text-quality";
import type { CardCredential, SoaRow, TransactionLine } from "@/lib/soa/types";
import { rasterizePdfPages } from "@/server/lib/pdf-rasterize";

import { creditCardService } from "./credit-card.service";
import { dueEntryUpsertService } from "./due-entry-upsert.service";
import { decryptPdfFile } from "./pdf-unlock.service";
import {
  soaAiExtractService,
  type SoaAiExtractResult,
} from "./soa-ai-extract.service";
import { soaPersistService } from "./soa-persist.service";
import { storageService } from "./storage.service";

const CARD_UNKNOWN_MESSAGE =
  "Could not detect which card this statement belongs to.";

function rcbcGeomImproves(
  baseline: TransactionLine[],
  candidate: TransactionLine[],
): boolean {
  if (candidate.length === 0) return false;
  return candidate.length > baseline.length;
}

function previewFromRow(
  row: SoaRow,
  month: CalendarMonth | null,
  usedAi: boolean,
) {
  return {
    issuerId: row.issuerId,
    bankLabel: row.bankLabel,
    cardLast4: row.cardLast4,
    statementDate: row.statementDate,
    dueDate: row.dueDate,
    minimumDue: row.minimumDue,
    totalDue: row.totalDue,
    transactionCount: row.transactions?.length ?? 0,
    month: month?.month ?? null,
    year: month?.year ?? null,
    usedAi,
  };
}

function rowFromAi(
  ai: SoaAiExtractResult,
  fileName: string,
  messageId: string,
  issuerId: string,
  last4: string,
): SoaRow {
  return {
    bankLabel: bankLabelForIssuer(issuerId),
    issuerId,
    cardLast4: last4,
    sourceEmailSubject: "Manual upload",
    sourceMessageId: messageId,
    pdfFileName: fileName,
    minimumDue: ai.minimumDue ?? "—",
    totalDue: ai.totalDue ?? "—",
    statementDate: ai.statementDate ?? "—",
    dueDate: ai.dueDate ?? "—",
    transactions: ai.transactions,
  };
}

function finalizeRow(row: SoaRow, cards: CardCredential[]): SoaRow | null {
  const dated = {
    ...row,
    statementDate: normalizeSoaDisplayDate(row.statementDate),
    dueDate: normalizeSoaDisplayDate(row.dueDate),
  };
  const withMeta = applyMatchedCardMeta(dated, cards);
  if (
    !identityIsAssignedToKnownCard(withMeta.issuerId, withMeta.cardLast4, cards)
  ) {
    return null;
  }
  return withMeta;
}

export type ManualUploadProcessInput = {
  periodId: string;
  storagePath: string;
  originalFileName: string;
  mimeType?: string;
  forceMonth?: number;
  forceYear?: number;
  allowOutOfRange?: boolean;
};

export type ManualUploadProcessResult =
  | {
      status: "saved" | "updated";
      fileName: string;
      assignedMonth: CalendarMonth;
      outOfRange: boolean;
      preview: ReturnType<typeof previewFromRow>;
    }
  | {
      status: "needs_confirmation";
      fileName: string;
      reason: "out_of_range" | "unknown_month";
      detected: CalendarMonth | null;
      periodMonths: CalendarMonth[];
      periodLabel: string;
      preview: ReturnType<typeof previewFromRow>;
    }
  | {
      status: "error";
      fileName: string;
      message: string;
    };

async function loadPeriod(userId: string, periodId: string) {
  const period = await db.query.soaPeriods.findFirst({
    where: and(eq(soaPeriods.id, periodId), eq(soaPeriods.userId, userId)),
  });
  if (!period) {
    throw new TRPCError({ code: "NOT_FOUND", message: "SOA period not found" });
  }
  return period;
}

async function extractPdfText(
  localPath: string,
  cards: CardCredential[],
): Promise<{ text: string; password: string; unlockLast4: string }> {
  const withEmpty: CardCredential[] = [
    { issuer: "unknown", last4: "0000", password: "" },
    ...cards,
  ];
  const unlocked = await tryUnlockAndExtractText(localPath, withEmpty);
  let parseText = unlocked.text;
  const textQuality = assessSoaTextQuality(parseText);
  const issuerGuess = detectIssuerFromSoaText(parseText) ?? "bpi";
  const shouldTryOcr =
    !ocrDisabledForIssuer(issuerGuess) &&
    (!textQuality.looksUsable || ocrForcedForIssuer(issuerGuess));

  if (shouldTryOcr) {
    const { maxPages, scale, psmRaw, dualSparse } =
      ocrTuningForIssuer(issuerGuess);
    try {
      const ocrText = await ocrPdfToPlainText(localPath, unlocked.password, {
        maxPages,
        scale,
        psm: parseSoaOcrPsmEnv(psmRaw),
        dualSparse,
      });
      const picked = pickBetterSoaText(parseText, ocrText);
      if (picked.usedCandidate) parseText = picked.text;
    } catch {
      /* keep extracted text */
    }
  }

  return {
    text: parseText,
    password: unlocked.password,
    unlockLast4: unlocked.last4,
  };
}

async function maybeRcbcGeometry(
  localPath: string,
  password: string,
  issuerId: string,
  parseText: string,
): Promise<string> {
  if (issuerId !== "rcbc") return parseText;
  try {
    const [linesYDesc, linesYAsc] = await extractPdfLinesReadingOrderDualAxis(
      localPath,
      password,
    );
    let txnSource = parseText;
    let bestTxns = extractTransactions("rcbc", parseText);
    for (const lines of [linesYDesc, linesYAsc]) {
      const candidate = lines.join("\n");
      const tx = extractTransactions("rcbc", candidate);
      if (rcbcGeomImproves(bestTxns, tx)) {
        bestTxns = tx;
        txnSource = candidate;
      }
    }
    return txnSource;
  } catch {
    return parseText;
  }
}

async function firstPdfPagePng(
  localPath: string,
  password: string,
): Promise<Buffer | null> {
  try {
    for await (const page of rasterizePdfPages(localPath, password, 1.5, 1)) {
      return page;
    }
  } catch {
    return null;
  }
  return null;
}

export const soaManualUploadService = {
  async process(
    userId: string,
    input: ManualUploadProcessInput,
  ): Promise<ManualUploadProcessResult> {
    const fileName = input.originalFileName || "upload";

    if (!privateStoragePathBelongsToUser(input.storagePath, userId)) {
      throw new TRPCError({
        code: "FORBIDDEN",
        message: "Invalid file path",
      });
    }

    const period = await loadPeriod(userId, input.periodId);
    const periodFrom: CalendarMonth = {
      month: period.fromMonth,
      year: period.fromYear,
    };
    const periodTo: CalendarMonth = {
      month: period.toMonth,
      year: period.toYear,
    };
    const periodMonths = enumerateCalendarMonths(periodFrom, periodTo);
    const periodLabel = `${formatSoaPeriodLabel(period.fromMonth, period.fromYear)}${
      period.fromMonth !== period.toMonth || period.fromYear !== period.toYear
        ? ` – ${formatSoaPeriodLabel(period.toMonth, period.toYear)}`
        : ""
    }`;

    const cards = await creditCardService.listForSoaPipeline(userId);
    if (!cards.length) {
      return {
        status: "error",
        fileName,
        message: "Add a credit card before uploading a statement.",
      };
    }

    const credentials: CardCredential[] = cards.map((c) => ({
      issuer: c.issuer,
      last4: c.last4,
      password: c.password,
      label: c.label,
      fullPan: c.fullPan,
      contactLine: c.contactLine,
    }));

    const knownForAi = cards.map((c) => ({
      issuer: c.issuer,
      last4: c.last4,
      label: c.label,
    }));

    const messageId = `manual:${randomUUID()}`;
    let usedAi = false;
    let row: SoaRow | null = null;
    let persistStoragePath = input.storagePath;

    try {
      const localPath = await storageService.resolveLocalPath(
        input.storagePath,
      );
      const bytes = await readFile(localPath);
      const mime =
        resolveAllowedUploadMime(bytes, fileName, input.mimeType) ?? "";
      const isImage = isImageMime(mime);
      const isPdf = isPdfMime(mime);

      if (isImage && !isPdf) {
        const ai = await soaAiExtractService.extractFromImage(
          userId,
          bytes,
          mime,
          knownForAi,
        );
        if (!ai) {
          return {
            status: "error",
            fileName,
            message:
              "Could not read this image. Add AI keys in Settings or upload a PDF.",
          };
        }
        usedAi = true;
        const identity = resolveIssuerAndLast4({
          text: `${ai.issuerId ?? ""} ${ai.cardLast4 ?? ""} ${ai.statementDate ?? ""}`,
          cards: credentials,
          unlockLast4: last4MatchesKnownCard(ai.cardLast4 ?? "", credentials)
            ? (ai.cardLast4 ?? "")
            : "",
          ai,
        });
        if (
          !identityIsAssignedToKnownCard(
            identity.issuerId,
            identity.last4,
            credentials,
          )
        ) {
          return {
            status: "error",
            fileName,
            message: CARD_UNKNOWN_MESSAGE,
          };
        }
        row = rowFromAi(
          ai,
          fileName,
          messageId,
          identity.issuerId,
          identity.last4,
        );
      } else if (isPdf) {
        const extracted = await extractPdfText(localPath, credentials);
        let ai: SoaAiExtractResult | null = null;
        if (!assessSoaTextQuality(extracted.text).looksUsable) {
          ai = await soaAiExtractService.extractFromText(
            userId,
            extracted.text,
            knownForAi,
          );
          if (ai) usedAi = true;
        }

        let identity = resolveIssuerAndLast4({
          text: extracted.text,
          cards: credentials,
          unlockLast4: extracted.unlockLast4,
          ai,
        });

        if (
          !identityIsAssignedToKnownCard(
            identity.issuerId,
            identity.last4,
            credentials,
          )
        ) {
          if (!ai) {
            ai = await soaAiExtractService.extractFromText(
              userId,
              extracted.text,
              knownForAi,
            );
            if (ai) usedAi = true;
          }
          identity = resolveIssuerAndLast4({
            text: extracted.text,
            cards: credentials,
            unlockLast4: extracted.unlockLast4,
            ai,
          });
        }

        if (
          !identityIsAssignedToKnownCard(
            identity.issuerId,
            identity.last4,
            credentials,
          )
        ) {
          const page = await firstPdfPagePng(localPath, extracted.password);
          if (page) {
            const vision = await soaAiExtractService.extractFromImage(
              userId,
              page,
              "image/png",
              knownForAi,
            );
            if (vision) {
              usedAi = true;
              ai = vision;
              identity = resolveIssuerAndLast4({
                text: extracted.text,
                cards: credentials,
                unlockLast4: extracted.unlockLast4,
                ai,
              });
            }
          }
        }

        if (
          !identityIsAssignedToKnownCard(
            identity.issuerId,
            identity.last4,
            credentials,
          )
        ) {
          return {
            status: "error",
            fileName,
            message: CARD_UNKNOWN_MESSAGE,
          };
        }

        const txnText = await maybeRcbcGeometry(
          localPath,
          extracted.password,
          identity.issuerId,
          extracted.text,
        );
        row = parseSoaText(
          bankLabelForIssuer(identity.issuerId),
          identity.issuerId,
          identity.last4,
          "Manual upload",
          messageId,
          fileName,
          extracted.text,
        );
        row.transactions = extractTransactions(identity.issuerId, txnText);
        row = mergeAiIntoSoaRow(row, ai);

        if (soaRowNeedsAiFill(row) && !ai) {
          const fill = await soaAiExtractService.extractFromText(
            userId,
            extracted.text,
            knownForAi,
          );
          if (fill) {
            usedAi = true;
            row = mergeAiIntoSoaRow(row, fill);
            const filledIdentity = resolveIssuerAndLast4({
              text: extracted.text,
              cards: credentials,
              unlockLast4: extracted.unlockLast4,
              ai: fill,
            });
            if (
              identityIsAssignedToKnownCard(
                filledIdentity.issuerId,
                filledIdentity.last4,
                credentials,
              )
            ) {
              row.issuerId = filledIdentity.issuerId;
              row.bankLabel = bankLabelForIssuer(filledIdentity.issuerId);
              row.cardLast4 = filledIdentity.last4;
            }
          }
        }

        try {
          const unlocked = await decryptPdfFile(localPath, extracted.password);
          persistStoragePath = await storageService.uploadPrivate(
            userId,
            `unlocked-${fileName.replace(/[^a-zA-Z0-9._-]/g, "_")}`,
            unlocked,
            "application/pdf",
            "soa",
          );
        } catch {
          persistStoragePath = input.storagePath;
        }
      } else {
        return {
          status: "error",
          fileName,
          message: "Upload a PDF or image of the statement.",
        };
      }
    } catch (error) {
      if (error instanceof TRPCError) throw error;
      const message =
        error instanceof Error ? error.message : "Could not read the file.";
      if (/password/i.test(message)) {
        return {
          status: "error",
          fileName,
          message: "Could not open this PDF. Check the card PDF password.",
        };
      }
      return { status: "error", fileName, message: "Could not read the file." };
    }

    if (!row) {
      return {
        status: "error",
        fileName,
        message: "Could not parse this file.",
      };
    }

    row = finalizeRow(row, credentials);
    if (!row) {
      return {
        status: "error",
        fileName,
        message: CARD_UNKNOWN_MESSAGE,
      };
    }

    row.sourceEmailSubject = "Manual upload";
    row.sourceMessageId = messageId;
    row.pdfFileName = fileName;
    row.pdfStoragePath = persistStoragePath;

    const detectedMonth = calendarMonthFromSoaDates(
      row.statementDate,
      row.dueDate,
    );
    const force = isValidCalendarMonth({
      month: input.forceMonth ?? 0,
      year: input.forceYear ?? 0,
    })
      ? { month: input.forceMonth!, year: input.forceYear! }
      : null;
    const aligned = alignManualUploadMonth({
      detected: detectedMonth,
      periodFrom,
      periodTo,
      force,
      allowOutOfRange: input.allowOutOfRange,
    });

    const preview = previewFromRow(row, detectedMonth, usedAi);

    if (aligned.kind === "needs_confirmation") {
      return {
        status: "needs_confirmation",
        fileName,
        reason: aligned.reason,
        detected: aligned.detected,
        periodMonths,
        periodLabel,
        preview,
      };
    }

    const persistMonth = aligned.month;
    const persisted = await soaPersistService.persistRows(
      userId,
      [row],
      persistMonth,
    );
    if (persisted.saved === 0 && persisted.updated === 0) {
      return {
        status: "error",
        fileName,
        message: "Could not save this statement.",
      };
    }

    await dueEntryUpsertService.upsertFromSoaRows(userId, [row]);

    return {
      status: persisted.updated > 0 ? "updated" : "saved",
      fileName,
      assignedMonth: persistMonth,
      outOfRange: aligned.outOfRange,
      preview: previewFromRow(row, persistMonth, usedAi),
    };
  },
};
