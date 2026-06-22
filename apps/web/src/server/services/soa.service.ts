import { desc, eq, inArray, and } from "drizzle-orm";
import { access, readFile } from "fs/promises";
import { basename } from "path";

import { db } from "@/lib/db";
import { soaPeriods, soaStatements } from "@/lib/db/schema";
import { creditCardService } from "./credit-card.service";
import { dueSyncService } from "./due-sync.service";
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
};

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

type SoaMonthResult = {
  month: number;
  year: number;
  rows: Awaited<
    ReturnType<
      typeof import("@/server/legacy/pay-credit-cards/soa-run").runSoaSingleMonth
    >
  >["rows"];
  summaryPath: string;
};

async function runSoaDetailedInService(input: RunSoaPipelineInput): Promise<{
  months: SoaMonthResult[];
  allRows: SoaMonthResult["rows"];
  notifyPdfPath: string;
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
    const r = await runSoaSingleMonth({ month, year, skipBanner: true });
    const title = `${r.ctx.monthLong} ${r.ctx.year}`;
    await writeSummaryPdf(r.rows, r.summaryPath, title, title);
    upsertDuesFromSoaRows(r.rows);
    return {
      months: [
        {
          month: input.fromMonth,
          year: input.fromYear,
          rows: r.rows,
          summaryPath: r.summaryPath,
        },
      ],
      allRows: r.rows,
      notifyPdfPath: r.summaryPath,
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

  for (const g of contexts) {
    const month = String(g.monthIndex0 + 1);
    const year = String(g.year);
    const r = await runSoaSingleMonth({ month, year, skipBanner: true });
    const title = `${g.monthLong} ${g.year}`;
    await writeSummaryPdf(r.rows, r.summaryPath, title, title);
    months.push({
      month: g.monthIndex0 + 1,
      year: g.year,
      rows: r.rows,
      summaryPath: r.summaryPath,
    });
    rangeParts.push({
      periodLabel: title,
      periodKey: r.periodKey,
      rows: r.rows,
    });
  }

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
  await writeRangeSummaryPdf(rangeParts, rangePdfPath, rangeTitle);

  const allRows = months.flatMap((m) => m.rows);
  upsertDuesFromSoaRows(allRows);

  return { months, allRows, notifyPdfPath: rangePdfPath };
}

async function persistRunPdfs(
  userId: string,
  workDir: string,
  periodId: string,
  detailed: {
    months: SoaMonthResult[];
    notifyPdfPath: string;
  },
) {
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
  } catch {
    // summary PDF missing on disk
  }
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
    const cards = await creditCardService.listForLegacy(userId);
    if (!cards.length) {
      return { ok: false as const, message: "No credit cards configured" };
    }

    const workDir = await prepareLegacyRuntime(userId);

    const period = await soaPeriodService.upsertPeriod(userId, {
      mode: input.mode,
      fromMonth: input.fromMonth,
      fromYear: input.fromYear,
      toMonth: input.toMonth,
      toYear: input.toYear,
      notifyTelegram: input.notifyTelegram,
      notifySlack: input.notifySlack,
      createCalendar: input.createCalendar,
    });

    const detailed = await runSoaDetailedInService(input);

    let notify: { telegram: boolean; slack: boolean; error?: string } | null =
      null;
    if (input.notifyTelegram || input.notifySlack) {
      try {
        const { notifySummaryPdf } =
          await import("@/server/legacy/pay-credit-cards/notify");
        const { isNotifyConfigured } =
          await import("@/server/legacy/pay-credit-cards/config");
        if (isNotifyConfigured()) {
          const result = await notifySummaryPdf(
            detailed.notifyPdfPath,
            "SOA summary (automated)",
            {
              telegram: input.notifyTelegram,
              slack: input.notifySlack,
            },
          );
          notify = result;
        }
      } catch (error) {
        notify = {
          telegram: false,
          slack: false,
          error: error instanceof Error ? error.message : String(error),
        };
      }
    }

    let calendar: { created: number; deleted: number; error?: string } | null =
      null;
    if (input.createCalendar) {
      try {
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
    for (const monthResult of detailed.months) {
      const persisted = await soaPersistService.persistRows(
        userId,
        monthResult.rows,
        { month: monthResult.month, year: monthResult.year },
      );
      saved += persisted.saved;
      updated += persisted.updated;
    }

    await persistRunPdfs(userId, workDir, period.id, detailed);

    const sync = await dueSyncService.syncFromLegacyFile(userId, workDir);

    if (isMultiMonthPeriod(input)) {
      await soaPeriodService.pruneRedundantSinglePeriods(userId);
    }

    return {
      ok: true as const,
      periodId: period.id,
      rowCount: detailed.allRows.length,
      sync,
      persisted: { saved, updated },
      calendar,
      notify,
    };
  },

  async pollNewSoaFromGmail(userId: string) {
    const cards = await creditCardService.listForLegacy(userId);
    if (!cards.length) {
      return { ok: false, message: "No credit cards configured" };
    }

    const workDir = await prepareLegacyRuntime(userId);

    const { pollNewSoaFromGmail } =
      await import("@/server/legacy/pay-credit-cards/gmail-poll-new-soa");
    await pollNewSoaFromGmail();

    if (process.exitCode && process.exitCode !== 0) {
      throw new Error(
        "Gmail SOA poll failed while processing new messages. Reconnect Google on Integrations if the issue persists.",
      );
    }

    const sync = await dueSyncService.syncFromLegacyFile(userId, workDir);
    await soaPeriodService.pruneRedundantSinglePeriods(userId);
    return { ok: true, sync };
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
