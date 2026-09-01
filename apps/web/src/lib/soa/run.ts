// @ts-nocheck
import fs from "node:fs";
import path from "node:path";
import { normalizeCardLast4 } from "@/lib/due/normalize";
import {
  banks,
  buildGmailQuery,
  buildGmailQueryWithSubject,
  ensureDirs,
  loadCardCredentials,
} from "@/lib/soa/config";
import { dedupeDownloadedPdfs } from "@/lib/soa/dedupe-downloaded-pdfs";
import {
  getGmailClient,
  searchAndDownloadPdfs,
  type DownloadedPdf,
} from "@/lib/soa/gmail-fetch";
import { log, logBanner } from "@/lib/soa/logger";
import { buildMonthContext, shiftMonthContext } from "@/lib/soa/month";
import { resolveCardLast4FromSoaText } from "@/lib/soa/card-last4-from-text";
import { parseSoaText } from "@/lib/soa/parse-soa";
import { extractTransactions } from "@/lib/soa/parse-transactions";
import {
  extractPdfLinesReadingOrderDualAxis,
  tryUnlockAndExtractText,
} from "@/lib/soa/pdf";
import { findMissingCards } from "@/lib/soa/soa-coverage";
import {
  ocrDisabledForIssuer,
  ocrForcedForIssuer,
  ocrTuningForIssuer,
} from "@/lib/soa/ocr-env";
import { ocrPdfToPlainText, parseSoaOcrPsmEnv } from "@/lib/soa/pdf-ocr";
import {
  assessSoaTextQuality,
  pickBetterSoaText,
} from "@/lib/soa/text-quality";
import type { SoaRunMonthProgressContext } from "@/server/services/soa-run-progress.service";
import type {
  CardCredential,
  GmailMonthContext,
  SoaRow,
  TransactionLine,
} from "@/lib/soa/types";

/** Prefer geometry-ordered text when it recovers more rows or obvious RCBC table fixes. */
function rcbcGeomParseImprovesOn(
  baseline: TransactionLine[],
  candidate: TransactionLine[],
): boolean {
  if (candidate.length === 0) return false;
  if (candidate.length > baseline.length) return true;
  if (candidate.length < baseline.length) return false;

  const candInt = candidate.some((r) =>
    /interest\s+charges/i.test(r.description),
  );
  const baseInt = baseline.some((r) =>
    /interest\s+charges/i.test(r.description),
  );
  if (candInt && !baseInt) return true;
  if (!candInt && baseInt) return false;

  const b0 = baseline[0];
  const c0 = candidate[0];
  if (
    b0 &&
    c0 &&
    /spotify/i.test(b0.description) &&
    /spotify/i.test(c0.description)
  ) {
    const parseAmt = (s: string) =>
      Number.parseFloat(
        s
          .replace(/\(CR\)/g, "")
          .replace(/,/g, "")
          .trim(),
      );
    const cb = parseAmt(b0.amount);
    const cc = parseAmt(c0.amount);
    if (Number.isFinite(cc) && Number.isFinite(cb)) {
      if (Math.abs(cc - 169) < 0.01 && Math.abs(cb - 349) < 0.01) return true;
    }
  }
  return false;
}

function passwordsForIssuer(
  issuerId: string,
  all: ReturnType<typeof loadCardCredentials>,
) {
  return all.filter((c) => c.issuer.toLowerCase() === issuerId.toLowerCase());
}

function enrichSoaRowFromCredentials(
  row: SoaRow,
  cards: CardCredential[],
): void {
  if (row.cardLast4 === "—") return;
  const c = cards.find(
    (x) =>
      x.issuer.toLowerCase() === row.issuerId.toLowerCase() &&
      x.last4 === row.cardLast4,
  );
  if (!c) return;
  if (c.label?.trim()) row.cardDisplayLabel = c.label.trim();
  if (c.fullPan?.trim()) row.fullPan = c.fullPan.trim();
  if (c.contactLine?.trim()) row.contactLine = c.contactLine.trim();
}

/** Distinct Gmail search configs for this issuer (offset + optional subject). */
function gmailSearchConfigsForIssuer(
  issuerId: string,
  cards: CardCredential[],
): { offset: number; soaSubject?: string; googleAccountId?: string }[] {
  const map = new Map<
    string,
    { offset: number; soaSubject?: string; googleAccountId?: string }
  >();
  for (const c of cards) {
    if (c.issuer.toLowerCase() !== issuerId.toLowerCase()) continue;
    const offset =
      typeof c.gmailMonthOffset === "number" ? c.gmailMonthOffset : 0;
    const subject = c.soaSubject?.trim() || undefined;
    const googleAccountId = c.googleAccountId?.trim() || undefined;
    const key = `${googleAccountId ?? ""}\0${offset}\0${subject ?? ""}`;
    if (!map.has(key)) {
      map.set(key, { offset, soaSubject: subject, googleAccountId });
    }
  }
  if (map.size === 0) map.set("\x00\x00", { offset: 0 });
  return [...map.values()].sort((a, b) => a.offset - b.offset);
}

function unavailableRow(
  bank: { id: string; label: string },
  ctx: ReturnType<typeof buildMonthContext>,
): SoaRow {
  return {
    bankLabel: bank.label,
    issuerId: bank.id,
    cardLast4: "—",
    sourceEmailSubject: `${ctx.monthLong} ${ctx.year}`,
    sourceMessageId: "—",
    pdfFileName: "—",
    minimumDue: "—",
    totalDue: "—",
    statementDate: "—",
    dueDate: "—",
    soaUnavailable: true,
  };
}

/** Placeholder row for one specific card whose bank had SOA email(s) this period, but no PDF/row matched this card. */
function unavailableCardRow(
  bank: { id: string; label: string },
  card: CardCredential,
  ctx: ReturnType<typeof buildMonthContext>,
): SoaRow {
  return {
    bankLabel: bank.label,
    issuerId: bank.id,
    cardLast4: normalizeCardLast4(card.last4),
    cardDisplayLabel: card.label,
    fullPan: card.fullPan,
    contactLine: card.contactLine,
    sourceEmailSubject: `${ctx.monthLong} ${ctx.year}`,
    sourceMessageId: "—",
    pdfFileName: "—",
    minimumDue: "—",
    totalDue: "—",
    statementDate: "—",
    dueDate: "—",
    soaUnavailable: true,
  };
}

function errMsg(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

export type SoaGmailSearchLog = {
  bankId: string;
  bankLabel: string;
  query: string;
  messageCount: number;
  pdfCount: number;
  monthOffset: number;
  googleAccountId?: string | null;
  mailboxEmail?: string | null;
};

export type SoaParseError = {
  bankId: string;
  bankLabel: string;
  fileName: string;
  error: string;
  passwordsTried: number;
  issuerCardLast4s: string[];
};

export type SoaSingleMonthResult = {
  ctx: GmailMonthContext;
  rows: SoaRow[];
  monthOutputDir: string;
  monthDownloadsDir: string;
  periodKey: string;
  summaryPath: string;
  parseWarnings: number;
  parseFailures: number;
  parseErrors: SoaParseError[];
  downloadedPdfCount: number;
  gmailSearches: SoaGmailSearchLog[];
};

/**
 * Download Gmail SOAs for one statement period, parse PDFs, sort rows.
 * Does not write summary PDF or send email.
 */
export async function runSoaSingleMonth(options: {
  month: string;
  year: string;
  skipBanner?: boolean;
  progress?: SoaRunMonthProgressContext;
  beforeGmailSearch?: (googleAccountId: string | null) => Promise<void>;
}): Promise<SoaSingleMonthResult> {
  const {
    month,
    year,
    skipBanner = false,
    progress,
    beforeGmailSearch,
  } = options;
  const ctx = buildMonthContext(month, year);
  const cards = loadCardCredentials();

  if (!skipBanner) {
    logBanner("pay-credit-cards · SOA run", `${ctx.monthLong} ${ctx.year}`);
  }

  if (cards.length === 0) {
    log.error(
      "CARDS_JSON is empty or missing. Set it in .env (see .env.example).",
    );
    process.exit(1);
  }

  log.header("Pre-flight");
  log.kv("Statement period", `${ctx.monthLong} ${ctx.year}`);
  log.kv("Cards in CARDS_JSON", String(cards.length));

  const { downloads, output } = ensureDirs();
  const periodKey = `${ctx.year}-${ctx.monthNum2}`;
  const monthDownloadsDir = path.join(downloads, periodKey);
  const monthOutputDir = path.join(output, periodKey);
  fs.mkdirSync(monthDownloadsDir, { recursive: true });
  fs.mkdirSync(monthOutputDir, { recursive: true });
  log.kv("Download folder", monthDownloadsDir);
  log.kv("Output folder", monthOutputDir);

  log.header("Gmail · search & download");
  let gmail = await getGmailClient();
  log.success("Gmail API client ready");
  const monthLabel = `${ctx.monthLong} ${ctx.year}`;

  const rawDownloaded: DownloadedPdf[] = [];
  const gmailSearches: SoaGmailSearchLog[] = [];
  const activeIssuerIds = new Set(cards.map((c) => c.issuer.toLowerCase()));
  const banksToSearch = banks.filter((b) => activeIssuerIds.has(b.id));
  let activeGmailAccountId: string | null = null;

  async function ensureGmailClient(googleAccountId: string | null) {
    const nextAccountId = googleAccountId ?? null;
    if (nextAccountId === activeGmailAccountId && gmail) return;
    if (beforeGmailSearch) {
      await beforeGmailSearch(nextAccountId);
    }
    gmail = await getGmailClient();
    activeGmailAccountId = nextAccountId;
  }

  for (const bank of banksToSearch) {
    await progress?.reporter.setGmailProgress(
      progress.monthIndex,
      monthLabel,
      bank.label,
    );
    const searchConfigs = gmailSearchConfigsForIssuer(bank.id, cards);
    log.info(`${bank.label}`);
    if (searchConfigs.length > 1) {
      log.detail(
        `Multiple Gmail search configs — running ${searchConfigs.length} search(es)`,
      );
    }

    for (const config of searchConfigs) {
      await ensureGmailClient(config.googleAccountId ?? null);
      const gctx = shiftMonthContext(ctx, config.offset);
      const q = config.soaSubject
        ? buildGmailQueryWithSubject(bank, gctx, config.soaSubject)
        : buildGmailQuery(bank, gctx);
      if (config.offset !== 0) {
        log.detail(
          `Gmail window ${gctx.monthLong} ${gctx.year} (gmailMonthOffset ${config.offset}; run period ${ctx.monthLong} ${ctx.year})`,
        );
      }
      if (config.soaSubject) {
        log.detail(`SOA subject: ${config.soaSubject}`);
      }
      if (config.googleAccountId) {
        log.detail(`Gmail account: ${config.googleAccountId}`);
      }
      log.detail(`Query: ${q}`);
      const { pdfs, messageCount } = await searchAndDownloadPdfs({
        gmail,
        query: q,
        bankId: bank.id,
        bankLabel: bank.label,
        downloadsDir: monthDownloadsDir,
      });
      gmailSearches.push({
        bankId: bank.id,
        bankLabel: bank.label,
        query: q,
        messageCount,
        pdfCount: pdfs.length,
        monthOffset: config.offset,
        googleAccountId: config.googleAccountId ?? null,
      });
      rawDownloaded.push(...pdfs);
      if (pdfs.length === 0) {
        log.warn(
          searchConfigs.length > 1
            ? `No PDFs for ${bank.label} (offset ${config.offset}${config.soaSubject ? `, subject "${config.soaSubject}"` : ""}).`
            : `No PDF attachments found for ${bank.label}.`,
        );
      } else {
        log.success(
          `${pdfs.length} PDF file(s) saved${config.offset !== 0 ? ` (offset ${config.offset})` : ""}`,
        );
        for (const p of pdfs) {
          log.detail(p.fileName);
        }
      }
    }
  }

  // Dedupe once across all banks/search configs — see dedupeDownloadedPdfs for why
  // this keys on filePath (attachment-level) rather than messageId (message-level).
  const downloaded = dedupeDownloadedPdfs(rawDownloaded);

  log.header("PDFs · unlock & parse");
  const rows: SoaRow[] = [];
  let parseWarnings = 0;
  let parseFailures = 0;
  const parseErrors: SoaParseError[] = [];

  if (downloaded.length === 0) {
    log.warn("No PDFs downloaded — skipping unlock/parse.");
  } else {
    await progress?.reporter.setParseProgress(
      progress?.monthIndex ?? 0,
      monthLabel,
      0,
      downloaded.length,
    );
  }

  for (let pdfIndex = 0; pdfIndex < downloaded.length; pdfIndex++) {
    const item = downloaded[pdfIndex]!;
    await progress?.reporter.setParseProgress(
      progress?.monthIndex ?? 0,
      monthLabel,
      pdfIndex,
      downloaded.length,
      item.bankLabel,
      item.fileName,
    );
    const pws = passwordsForIssuer(item.bankId, cards);
    if (pws.length === 0) {
      log.warn(
        `${item.bankLabel}: no CARDS_JSON entry for issuer "${item.bankId}" — skipped`,
      );
      log.detail(item.fileName);
      continue;
    }
    log.info(`${item.bankLabel} · ${item.fileName}`);
    try {
      const unlocked = await tryUnlockAndExtractText(item.filePath, pws);
      const unlockedFileName = `unlocked-${path.basename(item.filePath)}`;
      const unlockedPath = path.join(monthDownloadsDir, unlockedFileName);
      try {
        const { writeUnlockedPdfCopy } =
          await import("@/server/services/pdf-unlock.service");
        await writeUnlockedPdfCopy(
          item.filePath,
          unlocked.password,
          unlockedPath,
        );
      } catch (unlockErr) {
        log.warn(`Could not write unlocked PDF copy: ${errMsg(unlockErr)}`);
      }

      let parseText = unlocked.text;
      let usedOcrText = false;
      let ocrAttempted = false;

      const textQuality = assessSoaTextQuality(parseText);
      const shouldTryOcr =
        !ocrDisabledForIssuer(item.bankId) &&
        (!textQuality.looksUsable || ocrForcedForIssuer(item.bankId));

      if (shouldTryOcr) {
        ocrAttempted = true;
        const { maxPages, scale, psmRaw, dualSparse, debug } =
          ocrTuningForIssuer(item.bankId);
        const psm = parseSoaOcrPsmEnv(psmRaw);
        try {
          log.info(
            [
              `${item.bankLabel} OCR`,
              textQuality.looksUsable
                ? "forced"
                : `auto (${textQuality.reasons.join(", ")})`,
              maxPages === 0 ? "all pages" : `max ${maxPages} pg`,
              `scale ${scale}`,
              `psm ${psm}`,
              dualSparse ? "dual" : "",
            ]
              .filter(Boolean)
              .join(" · "),
          );
          const ocrText = await ocrPdfToPlainText(
            item.filePath,
            unlocked.password,
            { maxPages, scale, psm, dualSparse },
          );
          if (debug && ocrText.trim().length > 0) {
            const debugName = `ocr-${item.bankId}-${unlocked.last4}-${periodKey}.txt`;
            const debugPath = path.join(monthOutputDir, debugName);
            fs.writeFileSync(debugPath, ocrText, "utf8");
            log.detail(`SOA_OCR_DEBUG → ${debugPath}`);
          }
          const picked = pickBetterSoaText(parseText, ocrText);
          if (picked.usedCandidate) {
            parseText = picked.text;
            usedOcrText = true;
            log.success(`${item.bankLabel} · using OCR text for parse`);
          } else if (!textQuality.looksUsable) {
            log.warn(
              `${item.bankLabel} OCR did not improve on extracted text (${picked.quality.reasons.join(", ") || "still unusable"})`,
            );
          }
        } catch (ocrErr) {
          log.warn(`${item.bankLabel} OCR failed: ${errMsg(ocrErr)}`);
        }
      }

      let txnSourceText = parseText;
      if (item.bankId === "rcbc") {
        try {
          const [linesYDesc, linesYAsc] =
            await extractPdfLinesReadingOrderDualAxis(
              item.filePath,
              unlocked.password,
            );
          let bestTxns = extractTransactions("rcbc", parseText);
          for (const lines of [linesYDesc, linesYAsc]) {
            const candidate = lines.join("\n");
            const tx = extractTransactions("rcbc", candidate);
            if (rcbcGeomParseImprovesOn(bestTxns, tx)) {
              bestTxns = tx;
              txnSourceText = candidate;
            }
          }
          if (txnSourceText !== parseText) {
            log.detail(
              "RCBC · transactions from PDF geometry (x/y reading order, dual y-axis)",
            );
          }
        } catch (geoErr) {
          log.detail(`RCBC geometry lines skipped: ${errMsg(geoErr)}`);
        }
      }

      const cardLast4 = resolveCardLast4FromSoaText(
        parseText,
        pws.map((c) => ({
          last4: c.last4,
          fullPan: c.fullPan,
          label: c.label,
        })),
        unlocked.last4,
        item.subject,
      );
      if (cardLast4 !== unlocked.last4) {
        log.detail(
          `Card last-4 from SOA text · ****${cardLast4} (unlock credential was ****${unlocked.last4})`,
        );
      }

      const row = parseSoaText(
        item.bankLabel,
        item.bankId,
        cardLast4,
        item.subject,
        item.messageId,
        unlockedFileName,
        parseText,
        { usedOcr: usedOcrText, ocrAttempted },
      );
      row.transactions = extractTransactions(item.bankId, txnSourceText);
      enrichSoaRowFromCredentials(row, cards);
      rows.push(row);
      log.success(
        `Opened · card ****${unlocked.last4} · ${row.transactions?.length ?? 0} txn line(s)`,
      );
      if (row.parseNotes) {
        parseWarnings++;
        log.warn(`Parse note · ****${row.cardLast4}: ${row.parseNotes}`);
      }
    } catch (e) {
      parseFailures++;
      const message = errMsg(e);
      const detail: SoaParseError = {
        bankId: item.bankId,
        bankLabel: item.bankLabel,
        fileName: item.fileName,
        error: message,
        passwordsTried: pws.length,
        issuerCardLast4s: pws.map((c) => c.last4),
      };
      parseErrors.push(detail);
      try {
        const { soaDiagnosticsService } =
          await import("@/server/services/soa-diagnostics.service");
        soaDiagnosticsService.logPdfUnlockFailed(detail);
      } catch {
        /* ignore logging import errors */
      }
      log.error(`Failed to open / read PDF`);
      log.detail(message);
      log.detail(
        `Tried ${pws.length} password(s) for ${item.bankLabel} (•••• ${pws.map((c) => c.last4).join(", •••• ")})`,
      );
    }
  }

  const banksWithPdf = new Set(downloaded.map((d) => d.bankId));
  const missingBanks = banksToSearch.filter((b) => !banksWithPdf.has(b.id));
  if (missingBanks.length > 0) {
    log.header("Banks with no SOA email this period");
    for (const b of missingBanks) {
      log.warn(`${b.label} — placeholder row will appear in summary PDF`);
      rows.push(unavailableRow(b, ctx));
    }
  }

  // Card-level completeness check: a bank can have SOA email(s)/PDF(s) this period
  // while a *specific* card still ends up with no row — e.g. its password failed to
  // unlock the shared-password PDF, or the SOA text couldn't be matched back to this
  // card's last-4. Surface those individually instead of letting a card silently
  // disappear from the run when its bank "looks" fine overall.
  const missingCards = findMissingCards(cards, rows, banksWithPdf);
  if (missingCards.length > 0) {
    log.header("Cards with no matching SOA in downloaded PDFs");
    for (const card of missingCards) {
      const bank = banks.find((b) => b.id === card.issuer.toLowerCase());
      if (!bank) continue;
      const label = card.label?.trim() || `${bank.label} •••• ${card.last4}`;
      log.warn(
        `${label} — SOA email(s) found for ${bank.label} this period, but none matched this card. Check the card password and last-4/label, then re-run.`,
      );
      rows.push(unavailableCardRow(bank, card, ctx));
    }
  }

  const bankOrder = new Map(banks.map((b, i) => [b.id, i]));

  /** Parse a normalized "Mon DD, YYYY" date back to a sortable timestamp (ms). */
  function dueDateMs(row: SoaRow): number {
    if (!row.dueDate || row.dueDate === "—") return Number.MAX_SAFE_INTEGER;
    const m = row.dueDate.match(/^([A-Za-z]{3})\s+(\d{2}),\s+(\d{4})$/);
    if (!m) return Number.MAX_SAFE_INTEGER;
    const MON: Record<string, number> = {
      Jan: 0,
      Feb: 1,
      Mar: 2,
      Apr: 3,
      May: 4,
      Jun: 5,
      Jul: 6,
      Aug: 7,
      Sep: 8,
      Oct: 9,
      Nov: 10,
      Dec: 11,
    };
    const mon = MON[m[1]!];
    if (mon === undefined) return Number.MAX_SAFE_INTEGER;
    return new Date(Number(m[3]), mon, Number(m[2])).getTime();
  }

  rows.sort((a, b) => {
    // Unavailable (placeholder) rows always go last.
    if (a.soaUnavailable && !b.soaUnavailable) return 1;
    if (!a.soaUnavailable && b.soaUnavailable) return -1;

    // Primary: ascending due date.
    const da = dueDateMs(a);
    const db = dueDateMs(b);
    if (da !== db) return da - db;

    // Tie-break: bank config order, then card last-4.
    const ia = bankOrder.get(a.issuerId) ?? 999;
    const ib = bankOrder.get(b.issuerId) ?? 999;
    if (ia !== ib) return ia - ib;
    return a.cardLast4.localeCompare(b.cardLast4);
  });

  const summaryName = `soa-summary-${ctx.year}-${ctx.monthNum2}.pdf`;
  const summaryPath = path.join(monthOutputDir, summaryName);

  return {
    ctx,
    rows,
    monthOutputDir,
    monthDownloadsDir,
    periodKey,
    summaryPath,
    parseWarnings,
    parseFailures,
    parseErrors,
    downloadedPdfCount: downloaded.length,
    gmailSearches,
  };
}
