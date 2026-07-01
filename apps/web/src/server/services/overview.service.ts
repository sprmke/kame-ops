import { and, count, desc, eq, isNull } from "drizzle-orm";

import {
  computePeriodOverviewStats,
  flattenStatementTransactions,
} from "@/features/dashboard/soa/lib/period-overview-stats";
import { db } from "@/lib/db";
import {
  creditCards,
  dueEntries,
  soaPeriods,
  soaStatements,
} from "@/lib/db/schema";
import { daysUntilYmd, todayYmdLocal } from "@/lib/reminders/reminder-status";

import { reminderService } from "./reminder.service";
import { soaPeriodService } from "./soa-period.service";

export const overviewService = {
  async getStats(userId: string) {
    const asOf = todayYmdLocal();

    const [
      cardsCount,
      unpaidCount,
      statementsCount,
      periodCount,
      latestPeriodRow,
      unpaidDueRows,
      reminderStatus,
    ] = await Promise.all([
      db
        .select({ value: count() })
        .from(creditCards)
        .where(
          and(eq(creditCards.userId, userId), isNull(creditCards.deletedAt)),
        )
        .then(([row]) => row?.value ?? 0),
      db
        .select({ value: count() })
        .from(dueEntries)
        .where(and(eq(dueEntries.userId, userId), isNull(dueEntries.paidAt)))
        .then(([row]) => row?.value ?? 0),
      db
        .select({ value: count() })
        .from(soaStatements)
        .where(eq(soaStatements.userId, userId))
        .then(([row]) => row?.value ?? 0),
      db
        .select({ value: count() })
        .from(soaPeriods)
        .where(eq(soaPeriods.userId, userId))
        .then(([row]) => row?.value ?? 0),
      db.query.soaPeriods.findFirst({
        where: eq(soaPeriods.userId, userId),
        orderBy: [
          desc(soaPeriods.lastRunAt),
          desc(soaPeriods.fromYear),
          desc(soaPeriods.fromMonth),
          desc(soaPeriods.createdAt),
        ],
      }),
      reminderService.listDueEntries(userId, true),
      reminderService.getReminderStatus(userId),
    ]);

    const upcomingDues = unpaidDueRows.slice(0, 5).map((row) => ({
      id: row.id,
      issuerId: row.issuerId,
      bankLabel: row.bankLabel,
      cardLast4: row.cardLast4,
      cardDisplayLabel: row.cardDisplayLabel,
      dueDate: row.dueDate,
      dueDateYmd: row.dueDateYmd,
      statementPeriodKey: row.statementPeriodKey,
      statementPeriodLabel: row.statementPeriodLabel,
      minimumDue: row.minimumDue,
      totalDue: row.totalDue,
      paidAt: row.paidAt,
      daysAway: daysUntilYmd(row.dueDateYmd, asOf),
    }));

    let latestPeriod: {
      id: string;
      label: string;
      cardCount: number;
      paidCardCount: number;
      minimumMetCardCount: number;
      statementCount: number;
      totalDue: number;
      totalMinimum: number;
      grossStatementDue: number;
      grossMinimumDue: number;
      totalPaid: number;
      nextDueYmd: string | null;
      spendTotal: number;
      unanalyzed: number;
      interestFeesTotal: number;
      topCategory: { label: string; share: number | null } | null;
      analyzedCategoryRows: ReturnType<
        typeof computePeriodOverviewStats
      >["analyzedRows"];
      periodCards: Array<{
        label: string;
        issuerId: string;
        cardLast4: string;
        grossMinimumDue: number;
        minimumRemaining: number;
        minimumMet: boolean;
        markedPaid: boolean;
        outstandingDue: number;
        paidAmount: number;
      }>;
    } | null = null;

    if (latestPeriodRow) {
      const periodDetail = await soaPeriodService.getPeriod(
        userId,
        latestPeriodRow.id,
      );

      if (periodDetail) {
        const periodStats = computePeriodOverviewStats(
          flattenStatementTransactions(periodDetail.statements),
        );

        latestPeriod = {
          id: periodDetail.id,
          label: periodDetail.label,
          cardCount: periodDetail.cardCount,
          paidCardCount: periodDetail.paidCardCount,
          minimumMetCardCount: periodDetail.minimumMetCardCount,
          statementCount: periodDetail.statementCount,
          totalDue: periodDetail.totalDue,
          totalMinimum: periodDetail.totalMinimum,
          grossStatementDue: periodDetail.grossStatementDue,
          grossMinimumDue: periodDetail.grossMinimumDue,
          totalPaid: periodDetail.totalPaid,
          nextDueYmd: periodDetail.nextDueYmd,
          spendTotal: periodStats.spendTotal,
          unanalyzed: periodStats.unanalyzed,
          interestFeesTotal: periodStats.interestFeesTotal,
          topCategory: periodStats.topCategory
            ? {
                label: periodStats.topCategory.label,
                share: periodStats.topCategoryShare,
              }
            : null,
          analyzedCategoryRows: periodStats.analyzedRows,
          periodCards: periodDetail.periodCards.map((card) => ({
            label: card.label,
            issuerId: card.issuerId,
            cardLast4: card.cardLast4,
            grossMinimumDue: card.grossMinimumDue,
            minimumRemaining: card.minimumRemaining,
            minimumMet: card.minimumMet,
            markedPaid: card.markedPaid,
            outstandingDue: card.outstandingDue,
            paidAmount: card.paidAmount,
          })),
        };
      }
    }

    const lastSoa = await db.query.soaStatements.findFirst({
      where: eq(soaStatements.userId, userId),
      orderBy: [desc(soaStatements.createdAt)],
    });

    return {
      cards: cardsCount,
      unpaidDues: unpaidCount,
      statements: statementsCount,
      periodCount,
      reminders: {
        readyCount: reminderStatus.readyCount,
        inWindowCount: reminderStatus.inWindowCount,
      },
      latestPeriod,
      upcomingDues,
      lastSoaAt: lastSoa?.createdAt ?? null,
    };
  },
};
