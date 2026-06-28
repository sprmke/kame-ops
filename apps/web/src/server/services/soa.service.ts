import { desc, eq, inArray, and } from "drizzle-orm";
import { access, readFile } from "fs/promises";
import { basename } from "path";

import { db } from "@/lib/db";
import { soaPeriods, soaStatements } from "@/lib/db/schema";
import { creditCardService } from "./credit-card.service";
import { dueSyncService } from "./due-sync.service";
import { gmailService } from "./gmail.service";
import { integrationService } from "./integration.service";
import { prepareLegacyRuntime } from "./legacy-runtime.service";
import {
  soaPeriodService,
  isMultiMonthPeriod,
  type SoaPeriodMode,
} from "./soa-period.service";
import { soaPersistService } from "./soa-persist.service";
import {
  resolveDownloadedPdfPath,
  resolveMonthlySummaryPdfPath,
  resolveRangeSummaryPdfPath,
} from "./soa-pdf-path";
import {
  decryptPdfWithCredentials,
  UNLOCKED_PDF_PREFIX,
} from "./pdf-unlock.service";
import { storageService } from "./storage.service";
import {
  soaDiagnosticsService,
  type SoaParseFailureDetail,
} from "./soa-diagnostics.service";
import { SoaRunProgressReporter } from "./soa-run-progress.service";

export type RunSoaPipelineInput = {
  mode: SoaPeriodMode;
  fromMonth: number;
  fromYear: number;
  toMonth: number;
  toYear: number;
  monthCount?: number;
  notifyTelegram: boolean;
  notifySlack: boolean;
  createCalendar: boolean;
  runId?: string;
};

async function resolveRunPeriodBounds(input: RunSoaPipelineInput): Promise<{
  fromMonth: number;
  fromYear: number;
  toMonth: number;
  toYear: number;
}> {
  if (
    input.mode === "range" &&
    input.fromMonth === input.toMonth &&
    input.fromYear === input.toYear &&
    input.monthCount &&
    input.monthCount > 1
  ) {
    const { lastNMonthsEndingAt } =
      await import("@/server/legacy/pay-credit-cards/month");
    const contexts = lastNMonthsEndingAt(
      String(input.toMonth),
      String(input.toYear),
      input.monthCount,
    );
    const first = contexts[0]!;
    const last = contexts[contexts.length - 1]!;
    return {
      fromMonth: first.monthIndex0 + 1,
      fromYear: first.year,
      toMonth: last.monthIndex0 + 1,
      toYear: last.year,
    };
  }

  return {
    fromMonth: input.fromMonth,
    fromYear: input.fromYear,
    toMonth: input.toMonth,
    toYear: input.toYear,
  };
}

function resolveMonthCount(input: RunSoaPipelineInput): number {
  if (input.mode === "single") return 1;
  if (
    input.fromMonth === input.toMonth &&
    input.fromYear === input.toYear &&
    input.monthCount &&
    input.monthCount > 1
  ) {
    return input.monthCount;
  }
  const from = input.fromYear * 12 + input.fromMonth;
  const to = input.toYear * 12 + input.toMonth;
  return Math.max(1, to - from + 1);
}

export function defaultRunSoaInput(): RunSoaPipelineInput {
  const now = new Date();
  const month = now.getMonth() + 1;
  const year = now.getFullYear();
  return {
    mode: "single",
    fromMonth: month,
    fromYear: year,
    toMonth: month,
    toYear: year,
    notifyTelegram: true,
    notifySlack: true,
    createCalendar: false,
  };
}

type SoaGmailSearchLog = {
  bankId: string;
  bankLabel: string;
  query: string;
  messageCount: number;
  pdfCount: number;
  monthOffset: number;
};

type SoaMonthResult = {
  month: number;
  year: number;
  rows: Awaited<
    ReturnType<
      typeof import("@/server/legacy/pay-credit-cards/soa-run").runSoaSingleMonth
    >
  >["rows"];
  summaryPath: string;
  gmailSearches: SoaGmailSearchLog[];
};

function buildSoaGmailWarning(options: {
  parsedCount: number;
  unavailable: number;
  parseFailures: number;
  downloadedPdfCount: number;
  gmailSearches: SoaGmailSearchLog[];
  parseErrors: SoaParseFailureDetail[];
  mailboxEmail: string | null;
  connectedEmail: string | null;
  hasGmailReadScope: boolean;
}): string | undefined {
  const {
    parsedCount,
    unavailable,
    parseFailures,
    downloadedPdfCount,
    gmailSearches,
    parseErrors,
    mailboxEmail,
    connectedEmail,
    hasGmailReadScope,
  } = options;

  const parseWarning = soaDiagnosticsService.formatParseFailureWarning({
    parsedCount,
    downloadedPdfCount,
    parseFailures,
    parseErrors,
  });

  if (parsedCount > 0) {
    return parseWarning;
  }

  const totalMessages = gmailSearches.reduce((n, s) => n + s.messageCount, 0);
  const totalPdfs = gmailSearches.reduce((n, s) => n + s.pdfCount, 0);
  const mailbox = mailboxEmail ?? "unknown mailbox";

  if (!hasGmailReadScope) {
    return `Gmail token for ${mailbox} is missing gmail.readonly scope. Sign out and sign in again with Google on this environment.`;
  }

  if (
    connectedEmail &&
    mailboxEmail &&
    connectedEmail.toLowerCase() !== mailboxEmail.toLowerCase()
  ) {
    return `Gmail OAuth reads ${mailbox} but Integrations shows ${connectedEmail}. Sign in again on this site to reconnect the correct account.`;
  }

  if (parseWarning) return parseWarning;

  if (totalMessages === 0) {
    const sample = gmailSearches[0]?.query;
    const queryHint = sample ? ` Sample query: ${sample}` : "";
    return `Gmail (${mailbox}) returned 0 messages for your cards this period.${queryHint} If SOAs exist in another inbox, reconnect Google here.`;
  }

  if (totalPdfs === 0 && unavailable > 0) {
    return `No SOA emails found for your cards this period; ${unavailable} card(s) marked unavailable. Check SOA subject and Gmail month offset on each card.`;
  }

  if (unavailable > 0) {
    return `${unavailable} card(s) marked unavailable — no matching SOA email in Gmail for this period. Try Gmail month offset −1 or set a custom SOA subject on the card.`;
  }

  if (totalPdfs === 0) {
    return `Gmail (${mailbox}) found ${totalMessages} message(s) but no PDF attachments for your cards this period.`;
  }

  return "No statement PDFs parsed for this period. Try Gmail month offset −1 on cards if SOAs arrive early.";
}

async function runSoaDetailedInService(
  input: RunSoaPipelineInput,
  reporter: SoaRunProgressReporter | null,
): Promise<{
  months: SoaMonthResult[];
  allRows: SoaMonthResult["rows"];
  notifyPdfPath: string;
  gmailSearches: SoaGmailSearchLog[];
  parseFailures: number;
  downloadedPdfCount: number;
  parseErrors: SoaParseFailureDetail[];
}> {
  const { runSoaSingleMonth } =
    await import("@/server/legacy/pay-credit-cards/soa-run");
  const { writeSummaryPdf, writeRangeSummaryPdf } =
    await import("@/server/legacy/pay-credit-cards/summary-pdf");
  const { enumerateMonthsInclusive, lastNMonthsEndingAt } =
    await import("@/server/legacy/pay-credit-cards/month");
  const { upsertDuesFromSoaRows } =
    await import("@/server/legacy/pay-credit-cards/due-reminders-state");
  const { ensureDirs } =
    await import("@/server/legacy/pay-credit-cards/config");
  const path = await import("node:path");
  const fs = await import("node:fs");

  if (input.mode === "single") {
    const month = String(input.fromMonth);
    const year = String(input.fromYear);
    const { buildMonthContext } =
      await import("@/server/legacy/pay-credit-cards/month");
    const ctx = buildMonthContext(month, year);
    const monthLabel = `${ctx.monthLong} ${ctx.year}`;
    await reporter?.setGmailProgress(0, monthLabel);
    const r = await runSoaSingleMonth({
      month,
      year,
      skipBanner: true,
      progress: reporter
        ? {
            monthIndex: 0,
            totalMonths: 1,
            monthLabel,
            reporter,
          }
        : undefined,
    });
    await reporter?.completeStep("gmail");
    await reporter?.completeStep("parse");
    const title = `${r.ctx.monthLong} ${r.ctx.year}`;
    await reporter?.activate("summary", title);
    await writeSummaryPdf(r.rows, r.summaryPath, title, title);
    await reporter?.completeStep("summary");
    upsertDuesFromSoaRows(r.rows);
    return {
      months: [
        {
          month: input.fromMonth,
          year: input.fromYear,
          rows: r.rows,
          summaryPath: r.summaryPath,
          gmailSearches: r.gmailSearches,
        },
      ],
      allRows: r.rows,
      notifyPdfPath: r.summaryPath,
      gmailSearches: r.gmailSearches,
      parseFailures: r.parseFailures,
      downloadedPdfCount: r.downloadedPdfCount,
      parseErrors: r.parseErrors,
    };
  }

  const contexts =
    input.fromMonth === input.toMonth &&
    input.fromYear === input.toYear &&
    input.monthCount &&
    input.monthCount > 1
      ? lastNMonthsEndingAt(
          String(input.toMonth),
          String(input.toYear),
          input.monthCount,
        )
      : enumerateMonthsInclusive(
          String(input.fromMonth),
          String(input.fromYear),
          String(input.toMonth),
          String(input.toYear),
        );

  const months: SoaMonthResult[] = [];
  const rangeParts: {
    periodLabel: string;
    periodKey: string;
    rows: SoaMonthResult["rows"];
  }[] = [];
  let parseFailures = 0;
  let downloadedPdfCount = 0;
  const parseErrors: SoaParseFailureDetail[] = [];

  for (let i = 0; i < contexts.length; i++) {
    const g = contexts[i]!;
    const month = String(g.monthIndex0 + 1);
    const year = String(g.year);
    const monthLabel = `${g.monthLong} ${g.year}`;
    await reporter?.setGmailProgress(i, monthLabel);
    const r = await runSoaSingleMonth({
      month,
      year,
      skipBanner: true,
      progress: reporter
        ? {
            monthIndex: i,
            totalMonths: contexts.length,
            monthLabel,
            reporter,
          }
        : undefined,
    });
    const title = `${g.monthLong} ${g.year}`;
    await writeSummaryPdf(r.rows, r.summaryPath, title, title);
    parseFailures += r.parseFailures;
    downloadedPdfCount += r.downloadedPdfCount;
    parseErrors.push(...r.parseErrors);
    months.push({
      month: g.monthIndex0 + 1,
      year: g.year,
      rows: r.rows,
      summaryPath: r.summaryPath,
      gmailSearches: r.gmailSearches,
    });
    rangeParts.push({
      periodLabel: title,
      periodKey: r.periodKey,
      rows: r.rows,
    });
  }

  await reporter?.completeStep("gmail");
  await reporter?.completeStep("parse");

  const { output } = ensureDirs();
  const first = contexts[0]!;
  const last = contexts[contexts.length - 1]!;
  const rangeDir = path.join(
    output,
    `range-${first.year}-${first.monthNum2}-to-${last.year}-${last.monthNum2}`,
  );
  fs.mkdirSync(rangeDir, { recursive: true });
  const rangePdfPath = path.join(
    rangeDir,
    `soa-summary-range-${first.year}-${first.monthNum2}-to-${last.year}-${last.monthNum2}.pdf`,
  );
  const rangeTitle = `${first.monthLong} ${first.year} through ${last.monthLong} ${last.year}`;
  await reporter?.activate("summary", rangeTitle);
  await writeRangeSummaryPdf(rangeParts, rangePdfPath, rangeTitle);
  await reporter?.completeStep("summary");

  const allRows = months.flatMap((m) => m.rows);
  upsertDuesFromSoaRows(allRows);

  const gmailSearches = months.flatMap((m) => m.gmailSearches);

  return {
    months,
    allRows,
    notifyPdfPath: rangePdfPath,
    gmailSearches,
    parseFailures,
    downloadedPdfCount,
    parseErrors,
  };
}

async function persistRunPdfs(
  userId: string,
  workDir: string,
  periodId: string,
  detailed: {
    months: SoaMonthResult[];
    notifyPdfPath: string;
  },
  reporter: SoaRunProgressReporter | null,
) {
  const uploadTargets: { label: string }[] = [];
  for (const monthResult of detailed.months) {
    for (const row of monthResult.rows) {
      if (!row.pdfFileName || row.pdfFileName === "—" || row.soaUnavailable) {
        continue;
      }
      uploadTargets.push({ label: row.pdfFileName });
    }
  }
  uploadTargets.push({ label: "summary" });

  if (uploadTargets.length === 0) {
    await reporter?.activate("upload", "No PDFs to upload");
    await reporter?.completeStep("upload");
    return;
  }

  let uploaded = 0;
  for (const monthResult of detailed.months) {
    for (const row of monthResult.rows) {
      if (!row.pdfFileName || row.pdfFileName === "—" || row.soaUnavailable) {
        continue;
      }

      const localPath = await resolveDownloadedPdfPath(
        userId,
        monthResult.year,
        monthResult.month,
        row.pdfFileName,
      );
      if (!localPath) continue;

      const diskName = basename(localPath);
      const buffer = await readFile(localPath);
      const storagePath = await storageService.uploadPrivate(
        userId,
        diskName,
        buffer,
        "application/pdf",
        "soa",
      );

      await db
        .update(soaStatements)
        .set({
          pdfFileName: diskName,
          pdfStoragePath: storagePath,
        })
        .where(
          and(
            eq(soaStatements.userId, userId),
            eq(soaStatements.issuerId, row.issuerId),
            eq(soaStatements.cardLast4, row.cardLast4),
            eq(soaStatements.statementMonth, monthResult.month),
            eq(soaStatements.statementYear, monthResult.year),
          ),
        );
      uploaded += 1;
      await reporter?.setUploadProgress(uploaded, uploadTargets.length);
    }
  }

  try {
    await access(detailed.notifyPdfPath);
    const buffer = await readFile(detailed.notifyPdfPath);
    const storagePath = await storageService.uploadPrivate(
      userId,
      basename(detailed.notifyPdfPath),
      buffer,
      "application/pdf",
      "soa",
    );
    await db
      .update(soaPeriods)
      .set({ summaryPdfStoragePath: storagePath })
      .where(eq(soaPeriods.id, periodId));
    uploaded += 1;
    await reporter?.setUploadProgress(uploaded, uploadTargets.length);
  } catch {
    // summary PDF missing on disk
  }

  await reporter?.completeStep("upload");
}

export const soaService = {
  async listStatements(userId: string, limit = 50) {
    return db.query.soaStatements.findMany({
      where: eq(soaStatements.userId, userId),
      orderBy: [desc(soaStatements.createdAt)],
      limit,
      with: { transactions: true },
    });
  },

  async runSoaPipeline(userId: string, input: RunSoaPipelineInput) {
    const monthCount = resolveMonthCount(input);
    let reporter: SoaRunProgressReporter | null = null;
    if (input.runId) {
      reporter = await SoaRunProgressReporter.create(
        userId,
        input.runId,
        input,
        monthCount,
      );
      await reporter.activate("prepare", "Checking cards and PDF engines");
    }

    try {
      const preflight = await soaDiagnosticsService.checkCards(userId);
      if (!preflight.length) {
        await reporter?.fail("No credit cards configured");
        return { ok: false as const, message: "No credit cards configured" };
      }

      const preflightError =
        soaDiagnosticsService.formatPreflightFailure(preflight);
      const runtimeHints = await soaDiagnosticsService.runtimeHints();
      const pdfEngineError =
        soaDiagnosticsService.formatPdfEngineFailure(runtimeHints);
      if (pdfEngineError) {
        soaDiagnosticsService.logRunBlocked(userId, pdfEngineError, preflight);
        await reporter?.fail(pdfEngineError);
        return {
          ok: false as const,
          message: pdfEngineError,
          diagnostics: { preflight, runtime: runtimeHints },
        };
      }
      if (preflightError) {
        soaDiagnosticsService.logRunBlocked(userId, preflightError, preflight);
        await reporter?.fail(preflightError);
        return {
          ok: false as const,
          message: preflightError,
          diagnostics: { preflight, runtime: runtimeHints },
        };
      }

      await reporter?.completeStep("prepare");

      const periodLabel =
        input.mode === "single"
          ? `${input.fromMonth}/${input.fromYear}`
          : `${input.fromMonth}/${input.fromYear}–${input.toMonth}/${input.toYear}`;
      soaDiagnosticsService.logRunStart(userId, periodLabel, preflight);

      const workDir = await prepareLegacyRuntime(userId);

      let gmailMailbox: Awaited<
        ReturnType<typeof gmailService.getActiveMailboxProfile>
      > | null = null;
      try {
        gmailMailbox = await gmailService.getActiveMailboxProfile();
      } catch {
        // Gmail profile is optional diagnostics only
      }

      const gmailIntegration = await integrationService.getConfig<{
        email?: string;
      }>(userId, "gmail");

      const periodBounds = await resolveRunPeriodBounds(input);
      const period = await soaPeriodService.upsertPeriod(userId, {
        mode: input.mode,
        ...periodBounds,
        notifyTelegram: input.notifyTelegram,
        notifySlack: input.notifySlack,
        createCalendar: input.createCalendar,
      });

      const detailed = await runSoaDetailedInService(input, reporter);

      let notify: { telegram: boolean; slack: boolean; error?: string } | null =
        null;
      if (input.notifyTelegram || input.notifySlack) {
        try {
          const { notifySummaryPdf } =
            await import("@/server/legacy/pay-credit-cards/notify");
          const { isNotifyConfigured } =
            await import("@/server/legacy/pay-credit-cards/config");
          if (isNotifyConfigured()) {
            if (input.notifyTelegram) {
              await reporter?.activate("telegram", "Sending to Telegram");
            } else if (input.notifySlack) {
              await reporter?.activate("slack", "Sending to Slack");
            }
            const result = await notifySummaryPdf(
              detailed.notifyPdfPath,
              "SOA summary (automated)",
              {
                telegram: input.notifyTelegram,
                slack: input.notifySlack,
              },
            );
            notify = result;
            if (input.notifyTelegram) {
              await reporter?.completeStep("telegram");
            }
            if (input.notifySlack) {
              await reporter?.completeStep("slack");
            }
          }
        } catch (error) {
          notify = {
            telegram: false,
            slack: false,
            error: error instanceof Error ? error.message : String(error),
          };
        }
      }

      let calendar: {
        created: number;
        deleted: number;
        error?: string;
      } | null = null;
      if (input.createCalendar) {
        try {
          await reporter?.activate("calendar", "Syncing Google Calendar");
          const { createDueDateCalendarEvents } =
            await import("@/server/legacy/pay-credit-cards/google-calendar");
          const { calendarConfig } =
            await import("@/server/legacy/pay-credit-cards/config");
          const calResult = await createDueDateCalendarEvents(
            detailed.allRows,
            calendarConfig.calendarId,
          );
          calendar = {
            created: calResult.created,
            deleted: calResult.deleted,
          };
          await reporter?.completeStep("calendar");
        } catch (error) {
          calendar = {
            created: 0,
            deleted: 0,
            error: error instanceof Error ? error.message : String(error),
          };
        }
      }

      let saved = 0;
      let updated = 0;
      let unavailable = 0;
      await reporter?.activate("save", "Saving statements and due dates");
      for (const monthResult of detailed.months) {
        const persisted = await soaPersistService.persistRows(
          userId,
          monthResult.rows,
          { month: monthResult.month, year: monthResult.year },
        );
        saved += persisted.saved;
        updated += persisted.updated;
        unavailable += persisted.unavailable;
      }
      await reporter?.completeStep("save");

      await persistRunPdfs(userId, workDir, period.id, detailed, reporter);

      const sync = await dueSyncService.syncFromLegacyFile(userId, workDir);

      if (isMultiMonthPeriod(input)) {
        await soaPeriodService.pruneRedundantSinglePeriods(userId);
      }

      const statementCount = saved + updated;
      const parsedCount = detailed.allRows.filter(
        (row) => !row.soaUnavailable && row.cardLast4 !== "—",
      ).length;

      const warning = buildSoaGmailWarning({
        parsedCount,
        unavailable,
        parseFailures: detailed.parseFailures,
        downloadedPdfCount: detailed.downloadedPdfCount,
        parseErrors: detailed.parseErrors,
        gmailSearches: detailed.gmailSearches,
        mailboxEmail: gmailMailbox?.email ?? null,
        connectedEmail: gmailIntegration?.email ?? null,
        hasGmailReadScope: gmailMailbox?.hasGmailReadScope ?? true,
      });

      const diagnostics = {
        preflight,
        runtime: runtimeHints,
        parsedCount,
        downloadedPdfCount: detailed.downloadedPdfCount,
        parseFailures: detailed.parseFailures,
        parseErrors: detailed.parseErrors.map((e) => ({
          bankLabel: e.bankLabel,
          fileName: e.fileName,
          error: e.error,
          passwordsTried: e.passwordsTried,
          issuerCardLast4s: e.issuerCardLast4s,
        })),
        unavailableCount: unavailable,
        statementCount,
      };

      const navigationPeriodId =
        await soaPeriodService.resolveNavigationPeriodId(userId, period);

      soaDiagnosticsService.logRunEnd({
        userId,
        periodId: navigationPeriodId,
        ...diagnostics,
        warning: warning ?? null,
      });

      await reporter?.complete();

      return {
        ok: true as const,
        periodId: navigationPeriodId,
        rowCount: detailed.allRows.length,
        statementCount,
        parsedCount,
        unavailableCount: unavailable,
        warning,
        diagnostics,
        gmailMailbox: gmailMailbox
          ? {
              email: gmailMailbox.email,
              connectedEmail: gmailIntegration?.email ?? null,
              hasGmailReadScope: gmailMailbox.hasGmailReadScope,
              redirectUri: gmailMailbox.redirectUri,
            }
          : null,
        gmailSearches: detailed.gmailSearches,
        sync,
        persisted: { saved, updated, unavailable },
        calendar,
        notify,
        runId: input.runId ?? null,
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await reporter?.fail(message);
      throw error;
    } finally {
      await reporter?.flush();
    }
  },

  async dedupeStatements(userId: string) {
    const rows = await db.query.soaStatements.findMany({
      where: eq(soaStatements.userId, userId),
      orderBy: [desc(soaStatements.createdAt)],
    });

    const keepIds = new Set<string>();
    const seen = new Set<string>();

    for (const row of rows) {
      const key = `${row.issuerId}:${row.cardLast4}:${row.statementYear}:${row.statementMonth}`;
      if (seen.has(key)) continue;
      seen.add(key);
      keepIds.add(row.id);
    }

    const deleteIds = rows
      .filter((row) => !keepIds.has(row.id))
      .map((row) => row.id);

    if (deleteIds.length > 0) {
      await db
        .delete(soaStatements)
        .where(inArray(soaStatements.id, deleteIds));
    }

    return { removed: deleteIds.length, kept: keepIds.size };
  },

  async clearHistory(userId: string) {
    const deleted = await db
      .delete(soaStatements)
      .where(eq(soaStatements.userId, userId))
      .returning({ id: soaStatements.id });

    return { removed: deleted.length };
  },

  async readStatementPdfForPreview(
    userId: string,
    statementId: string,
  ): Promise<Buffer | null> {
    const stmt = await db.query.soaStatements.findFirst({
      where: and(
        eq(soaStatements.userId, userId),
        eq(soaStatements.id, statementId),
      ),
    });
    if (!stmt?.pdfFileName || stmt.pdfFileName === "—") return null;

    const filePath = await this.resolveStatementPdfPath(userId, statementId);
    if (!filePath) return null;

    let buffer: Buffer;
    try {
      buffer = await readFile(filePath);
    } catch {
      return null;
    }

    const baseName = basename(filePath);
    if (
      baseName.startsWith(UNLOCKED_PDF_PREFIX) ||
      stmt.pdfFileName.startsWith(UNLOCKED_PDF_PREFIX)
    ) {
      return buffer;
    }

    const cards = await creditCardService.listForLegacy(userId);
    const creds = cards.filter(
      (c) =>
        c.issuer.toLowerCase() === stmt.issuerId.toLowerCase() &&
        c.last4 === stmt.cardLast4,
    );
    if (!creds.length) return buffer;

    try {
      return Buffer.from(
        await decryptPdfWithCredentials(new Uint8Array(buffer), creds),
      );
    } catch {
      return buffer;
    }
  },

  async resolveStatementPdfPath(
    userId: string,
    statementId: string,
  ): Promise<string | null> {
    const stmt = await db.query.soaStatements.findFirst({
      where: and(
        eq(soaStatements.userId, userId),
        eq(soaStatements.id, statementId),
      ),
    });
    if (!stmt?.pdfFileName || stmt.pdfFileName === "—") return null;

    if (stmt.pdfStoragePath) {
      try {
        return await storageService.resolveLocalPath(stmt.pdfStoragePath);
      } catch {
        return null;
      }
    }

    return resolveDownloadedPdfPath(
      userId,
      stmt.statementYear,
      stmt.statementMonth,
      stmt.pdfFileName,
    );
  },

  async resolvePeriodSummaryPdfPath(
    userId: string,
    month: number,
    year: number,
    period?: {
      mode: string;
      fromMonth: number;
      fromYear: number;
      toMonth: number;
      toYear: number;
    },
  ): Promise<string | null> {
    if (
      period?.mode === "range" &&
      (period.fromMonth !== period.toMonth || period.fromYear !== period.toYear)
    ) {
      const rangePath = await resolveRangeSummaryPdfPath(
        userId,
        period.fromMonth,
        period.fromYear,
        period.toMonth,
        period.toYear,
      );
      if (rangePath) return rangePath;

      const endMonth = await resolveMonthlySummaryPdfPath(
        userId,
        period.toYear,
        period.toMonth,
      );
      if (endMonth) return endMonth;

      return resolveMonthlySummaryPdfPath(
        userId,
        period.fromYear,
        period.fromMonth,
      );
    }

    return resolveMonthlySummaryPdfPath(userId, year, month);
  },

  async readPeriodSummaryPdf(
    userId: string,
    period: {
      mode: string;
      fromMonth: number;
      fromYear: number;
      toMonth: number;
      toYear: number;
      label: string;
      summaryPdfStoragePath?: string | null;
    },
  ): Promise<Buffer | null> {
    if (period.summaryPdfStoragePath) {
      const stored = await storageService.readPrivate(
        period.summaryPdfStoragePath,
      );
      if (stored) return stored;
    }

    const filePath = await this.resolvePeriodSummaryPdfPath(
      userId,
      period.fromMonth,
      period.fromYear,
      period,
    );
    if (!filePath) return null;

    try {
      return await readFile(filePath);
    } catch {
      return null;
    }
  },
};
