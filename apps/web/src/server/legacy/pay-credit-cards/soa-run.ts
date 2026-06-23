// @ts-nocheck
import fs from "node:fs";
import path from "node:path";
import {
  banks,
  buildGmailQuery,
  buildGmailQueryWithSubject,
  ensureDirs,
  isNotifyConfigured,
  loadCardCredentials,
} from "./config";
import { notifySummaryPdf } from "./notify";
import { upsertDuesFromSoaRows } from "./due-reminders-state";
import {
  getGmailClient,
  searchAndDownloadPdfs,
  type DownloadedPdf,
} from "./gmail";
import { log, logBanner } from "./logger";
import {
  buildMonthContext,
  enumerateMonthsInclusive,
  lastNMonthsEndingAt,
  shiftMonthContext,
} from "./month";
import { parseSoaText } from "./parse-soa";
import { extractTransactions } from "./parse-transactions";
import {
  extractPdfLinesReadingOrderDualAxis,
  tryUnlockAndExtractText,
} from "./pdf";
import { writeRangeSummaryPdf, writeSummaryPdf } from "./summary-pdf";
import type {
  CardCredential,
  GmailMonthContext,
  SoaRow,
  TransactionLine,
} from "./types";

/** Single-month summary PDF title: optional name + label from env (see .env.example). */
function buildSoaSingleMonthPdfTitle(
  monthLong: string,
  year: string | number,
): string {
  const display = process.env.SOA_SUMMARY_DISPLAY_NAME?.trim() ?? "";
  const doc =
    process.env.SOA_SUMMARY_DOCUMENT_LABEL?.trim() || "Credit Card SOA Summary";
  const y = typeof year === "number" ? String(year) : year;
  const tail = `${doc} — ${monthLong} ${y}`;
  return display ? `${display} - ${tail}` : tail;
}

/** Combined range summary PDF title. */
function buildSoaRangePdfTitle(
  first: GmailMonthContext,
  last: GmailMonthContext,
): string {
  const label =
    process.env.SOA_SUMMARY_RANGE_LABEL?.trim() || "Credit Card SOA";
  return `${label} — ${first.monthLong} ${first.year} through ${last.monthLong} ${last.year}`;
}

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

export type RunSoaOptions = {
  mode: "single" | "range";
  month: string;
  year: string;
  /** When true, do not send Telegram/Slack notification after the PDF is written. */
  skipNotify: boolean;
  /** Set true when an outer script already showed a banner (e.g. run-prompt). */
  skipBanner?: boolean;
  /** Last N months ending at `month`/`year` (range mode, default 4). */
  rangeMonthCount?: number;
  /** Inclusive range endpoints (range mode). */
  fromMonth?: string;
  fromYear?: string;
  toMonth?: string;
  toYear?: string;
};

export function parseArgs(argv: string[]): RunSoaOptions {
  let month = "";
  let year = "";
  let skipNotify = false;
  let range = false;
  let rangeMonthCount: number | undefined;
  let fromMonth = "";
  let fromYear = "";
  let toMonth = "";
  let toYear = "";
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!;
    if (a === "--month" && argv[i + 1]) {
      month = argv[++i]!;
    } else if (a.startsWith("--month=")) {
      month = a.split("=")[1] ?? "";
    } else if (a === "--year" && argv[i + 1]) {
      year = argv[++i]!;
    } else if (a.startsWith("--year=")) {
      year = a.split("=")[1] ?? "";
    } else if (a === "--no-notify" || a === "--no-email") {
      skipNotify = true;
    } else if (a === "--range") {
      range = true;
    } else if (a === "--months" && argv[i + 1]) {
      rangeMonthCount = Number.parseInt(argv[++i]!, 10);
    } else if (a.startsWith("--months=")) {
      rangeMonthCount = Number.parseInt(a.split("=")[1] ?? "", 10);
    } else if (a === "--from-month" && argv[i + 1]) {
      fromMonth = argv[++i]!;
    } else if (a.startsWith("--from-month=")) {
      fromMonth = a.split("=")[1] ?? "";
    } else if (a === "--from-year" && argv[i + 1]) {
      fromYear = argv[++i]!;
    } else if (a.startsWith("--from-year=")) {
      fromYear = a.split("=")[1] ?? "";
    } else if (a === "--to-month" && argv[i + 1]) {
      toMonth = argv[++i]!;
    } else if (a.startsWith("--to-month=")) {
      toMonth = a.split("=")[1] ?? "";
    } else if (a === "--to-year" && argv[i + 1]) {
      toYear = argv[++i]!;
    } else if (a.startsWith("--to-year=")) {
      toYear = a.split("=")[1] ?? "";
    }
  }
  const now = new Date();
  if (!month) month = String(now.getMonth() + 1);
  if (!year) year = String(now.getFullYear());
  const mode: "single" | "range" = range ? "range" : "single";
  const out: RunSoaOptions = { mode, month, year, skipNotify };
  if (mode === "range") {
    if (fromMonth && fromYear && toMonth && toYear) {
      out.fromMonth = fromMonth;
      out.fromYear = fromYear;
      out.toMonth = toMonth;
      out.toYear = toYear;
    } else {
      let n =
        rangeMonthCount !== undefined && Number.isFinite(rangeMonthCount)
          ? Math.trunc(rangeMonthCount)
          : 4;
      if (n < 1) n = 4;
      if (n > 60) n = 60;
      out.rangeMonthCount = n;
    }
  }
  return out;
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
): { offset: number; soaSubject?: string }[] {
  const map = new Map<string, { offset: number; soaSubject?: string }>();
  for (const c of cards) {
    if (c.issuer.toLowerCase() !== issuerId.toLowerCase()) continue;
    const offset =
      typeof c.gmailMonthOffset === "number" ? c.gmailMonthOffset : 0;
    const subject = c.soaSubject?.trim() || undefined;
    const key = `${offset}\0${subject ?? ""}`;
    if (!map.has(key)) map.set(key, { offset, soaSubject: subject });
  }
  if (map.size === 0) map.set("0\0", { offset: 0 });
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
};

export type SoaParseError = {
  bankId: string;
  bankLabel: string;
  fileName: string;
  error: string;
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
}): Promise<SoaSingleMonthResult> {
  const { month, year, skipBanner = false } = options;
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
  const gmail = await getGmailClient();
  log.success("Gmail API client ready");

  const downloaded: DownloadedPdf[] = [];
  const seenMessage = new Set<string>();
  const gmailSearches: SoaGmailSearchLog[] = [];
  const activeIssuerIds = new Set(cards.map((c) => c.issuer.toLowerCase()));
  const banksToSearch = banks.filter((b) => activeIssuerIds.has(b.id));

  for (const bank of banksToSearch) {
    const searchConfigs = gmailSearchConfigsForIssuer(bank.id, cards);
    log.info(`${bank.label}`);
    if (searchConfigs.length > 1) {
      log.detail(
        `Multiple Gmail search configs — running ${searchConfigs.length} search(es)`,
      );
    }

    for (const config of searchConfigs) {
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
      });
      for (const p of pdfs) {
        const key = `${p.bankId}\0${p.messageId}`;
        if (seenMessage.has(key)) continue;
        seenMessage.add(key);
        downloaded.push(p);
      }
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

  log.header("PDFs · unlock & parse");
  const rows: SoaRow[] = [];
  let parseWarnings = 0;
  let parseFailures = 0;
  const parseErrors: SoaParseError[] = [];

  if (downloaded.length === 0) {
    log.warn("No PDFs downloaded — skipping unlock/parse.");
  }

  for (const item of downloaded) {
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
      let bpiUsedOcrText = false;

      const bpiOcrOn =
        item.bankId === "bpi" &&
        /^(1|true|yes)$/i.test(process.env.BPI_OCR?.trim() ?? "");
      if (bpiOcrOn) {
        const rawPages = process.env.BPI_OCR_PAGES?.trim();
        const parsed =
          rawPages !== undefined && rawPages !== ""
            ? Number.parseInt(rawPages, 10)
            : 0;
        const maxPages =
          !Number.isFinite(parsed) || parsed <= 0
            ? 0
            : Math.min(50, Math.max(1, parsed));
        const scale = Math.min(
          4,
          Math.max(
            1.5,
            Number.parseFloat(process.env.BPI_OCR_SCALE ?? "3") || 3,
          ),
        );
        const { ocrPdfToPlainText, parseBpiPsmEnv } = await import("./bpi-ocr");
        const psm = parseBpiPsmEnv(process.env.BPI_OCR_PSM);
        const dualSparse = /^(1|true|yes)$/i.test(
          process.env.BPI_OCR_DUAL?.trim() ?? "",
        );
        const ocrDebug = /^(1|true|yes)$/i.test(
          process.env.BPI_OCR_DEBUG?.trim() ?? "",
        );
        try {
          log.info(
            [
              "BPI OCR",
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
            {
              maxPages,
              scale,
              psm,
              dualSparse,
            },
          );
          if (ocrDebug && ocrText.trim().length > 0) {
            const debugName = `bpi-ocr-${unlocked.last4}-${periodKey}.txt`;
            const debugPath = path.join(monthOutputDir, debugName);
            fs.writeFileSync(debugPath, ocrText, "utf8");
            log.detail(`BPI_OCR_DEBUG → ${debugPath}`);
          }
          if (ocrText.trim().length >= 40) {
            parseText = ocrText;
            bpiUsedOcrText = true;
            log.success("BPI · using OCR text for parse");
          } else {
            log.warn(
              "BPI OCR returned almost no text — falling back to pdf.js extract",
            );
          }
        } catch (ocrErr) {
          log.warn(`BPI OCR failed: ${errMsg(ocrErr)}`);
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

      const row = parseSoaText(
        item.bankLabel,
        item.bankId,
        unlocked.last4,
        item.subject,
        item.messageId,
        unlockedFileName,
        parseText,
        { bpiFromOcr: bpiUsedOcrText },
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
      parseErrors.push({
        bankId: item.bankId,
        bankLabel: item.bankLabel,
        fileName: item.fileName,
        error: message,
      });
      log.error(`Failed to open / read PDF`);
      log.detail(message);
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

function rangeFolderKey(
  first: GmailMonthContext,
  last: GmailMonthContext,
): string {
  return `range-${first.year}-${first.monthNum2}-to-${last.year}-${last.monthNum2}`;
}

async function runSoaRange(options: RunSoaOptions): Promise<SoaRow[]> {
  const { skipNotify, skipBanner = false } = options;
  const cards = loadCardCredentials();
  if (cards.length === 0) {
    log.error(
      "CARDS_JSON is empty or missing. Set it in .env (see .env.example).",
    );
    process.exit(1);
  }

  const anyEndpoint =
    !!options.fromMonth ||
    !!options.fromYear ||
    !!options.toMonth ||
    !!options.toYear;
  const allEndpoints =
    !!options.fromMonth &&
    !!options.fromYear &&
    !!options.toMonth &&
    !!options.toYear;

  let contexts: GmailMonthContext[];
  if (anyEndpoint && !allEndpoints) {
    log.error(
      "For --range with explicit bounds, pass all of: --from-month, --from-year, --to-month, --to-year (or omit all four and use --months).",
    );
    process.exit(1);
  }
  if (allEndpoints) {
    contexts = enumerateMonthsInclusive(
      options.fromMonth!,
      options.fromYear!,
      options.toMonth!,
      options.toYear!,
    );
  } else {
    const n = options.rangeMonthCount ?? 4;
    contexts = lastNMonthsEndingAt(options.month, options.year, n);
  }

  if (!skipBanner) {
    const first = contexts[0]!;
    const last = contexts[contexts.length - 1]!;
    logBanner(
      "pay-credit-cards · SOA range",
      `${first.monthLong} ${first.year} → ${last.monthLong} ${last.year} (${contexts.length} months)`,
    );
  }

  log.header("Pre-flight");
  log.kv("Months in range", String(contexts.length));
  log.kv("Cards in CARDS_JSON", String(cards.length));
  log.kv(
    "Notify step",
    skipNotify ? "skipped (--no-notify / --no-email)" : "enabled",
  );

  const results: SoaSingleMonthResult[] = [];
  let totalWarnings = 0;
  let totalFailures = 0;

  for (let i = 0; i < contexts.length; i++) {
    const g = contexts[i]!;
    log.line("");
    log.header(`Period ${i + 1}/${contexts.length}: ${g.monthLong} ${g.year}`);
    const r = await runSoaSingleMonth({
      month: String(g.monthIndex0 + 1),
      year: String(g.year),
      skipBanner: true,
    });
    results.push(r);
    totalWarnings += r.parseWarnings;
    totalFailures += r.parseFailures;

    log.header(`Summary PDF · ${g.monthLong} ${g.year}`);
    const singleTitle = buildSoaSingleMonthPdfTitle(g.monthLong, g.year);
    await writeSummaryPdf(
      r.rows,
      r.summaryPath,
      singleTitle,
      `${g.monthLong} ${g.year}`,
    );
    log.success("Written");
    log.detail(r.summaryPath);
  }

  const { output } = ensureDirs();
  const first = contexts[0]!;
  const last = contexts[contexts.length - 1]!;
  const rangeDir = path.join(output, rangeFolderKey(first, last));
  fs.mkdirSync(rangeDir, { recursive: true });
  const rangePdfName = `soa-summary-range-${first.year}-${first.monthNum2}-to-${last.year}-${last.monthNum2}.pdf`;
  const rangePdfPath = path.join(rangeDir, rangePdfName);
  const rangeTitle = buildSoaRangePdfTitle(first, last);
  log.header("Combined range PDF");
  await writeRangeSummaryPdf(
    results.map((r) => ({
      periodLabel: `${r.ctx.monthLong} ${r.ctx.year}`,
      periodKey: r.periodKey,
      rows: r.rows,
    })),
    rangePdfPath,
    rangeTitle,
  );
  log.success("Written");
  log.detail(rangePdfPath);

  if (!skipNotify) {
    log.header("Notify (Telegram / Slack)");
    if (!isNotifyConfigured()) {
      log.warn("No notifier configured — skipping send.");
      log.detail(
        "Set TELEGRAM_BOT_TOKEN + TELEGRAM_CHAT_ID (PDF) and/or SLACK_WEBHOOK_URL, or use --no-notify.",
      );
    } else {
      try {
        const n = await notifySummaryPdf(
          rangePdfPath,
          `${rangeTitle} (automated)`,
        );
        if (n.telegram) log.success("Sent summary PDF to Telegram.");
        if (n.slack) log.success("Posted summary notice to Slack.");
      } catch (e) {
        log.error(errMsg(e));
        log.detail("Range PDF was still saved locally.");
      }
    }
  }

  log.header("Run summary");
  const parsedCards = results.reduce(
    (acc, r) => acc + r.rows.filter((row) => row.cardLast4 !== "—").length,
    0,
  );
  log.kv("Months processed", String(results.length));
  log.kv("Card-rows total (sum per month)", String(parsedCards));
  log.kv("Parse warnings", String(totalWarnings));
  log.kv("PDF failures", String(totalFailures));
  log.line("");

  const allRows = results.flatMap((r) => r.rows);
  persistDueReminders(allRows);
  return allRows;
}

function persistDueReminders(rows: SoaRow[]): void {
  try {
    const res = upsertDuesFromSoaRows(rows);
    if (res.added === 0 && res.updated === 0) return;
    log.info(
      `Due reminders state: +${res.added} added, ${res.updated} refreshed.`,
    );
    log.detail(res.path);
  } catch (e) {
    log.warn(
      `Could not update due reminders state: ${
        e instanceof Error ? e.message : String(e)
      }`,
    );
  }
}

export async function runSoa(options: RunSoaOptions): Promise<SoaRow[]> {
  if (options.mode === "range") {
    return runSoaRange(options);
  }

  const { month, year, skipNotify, skipBanner = false } = options;
  const r = await runSoaSingleMonth({ month, year, skipBanner });

  log.kv(
    "Notify step",
    skipNotify ? "skipped (--no-notify / --no-email)" : "enabled",
  );

  log.header("Summary PDF");
  const title = buildSoaSingleMonthPdfTitle(r.ctx.monthLong, r.ctx.year);
  await writeSummaryPdf(
    r.rows,
    r.summaryPath,
    title,
    `${r.ctx.monthLong} ${r.ctx.year}`,
  );
  log.success(`Written`);
  log.detail(r.summaryPath);

  if (!skipNotify) {
    log.header("Notify (Telegram / Slack)");
    if (!isNotifyConfigured()) {
      log.warn("No notifier configured — skipping send.");
      log.detail(
        "Set TELEGRAM_BOT_TOKEN + TELEGRAM_CHAT_ID (PDF) and/or SLACK_WEBHOOK_URL, or use --no-notify.",
      );
    } else {
      try {
        const n = await notifySummaryPdf(r.summaryPath, `${title} (automated)`);
        if (n.telegram) log.success("Sent summary PDF to Telegram.");
        if (n.slack) log.success("Posted summary notice to Slack.");
      } catch (e) {
        log.error(errMsg(e));
        log.detail("Summary PDF was still saved locally.");
      }
    }
  }

  log.header("Run summary");
  const parsedCards = r.rows.filter((row) => row.cardLast4 !== "—").length;
  log.kv("Rows in summary", String(r.rows.length));
  log.kv("Cards with parsed SOA", String(parsedCards));
  log.kv("Parse warnings", String(r.parseWarnings));
  log.kv("PDF failures", String(r.parseFailures));
  log.line("");

  persistDueReminders(r.rows);
  return r.rows;
}
