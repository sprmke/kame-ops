import { and, desc, eq, inArray, sql } from "drizzle-orm";

import { db } from "@/lib/db";
import { dueEntries, soaPeriods, soaStatements } from "@/lib/db/schema";
import {
  computeOutstandingTotals,
  computeTotalPaid,
  type DuePaymentLookupRow,
} from "@/lib/soa/outstanding";

import { enrichDueEntriesWithSoaPeriod } from "./due-statement-period.service";
import { ensureDueEntryCardIdentity } from "./statement-card-identity.service";

import { transactionCategoryService } from "./transaction-category.service";
import { creditCardService } from "./credit-card.service";

type CardColorLookup = Map<string, string | null>;

async function loadCardColorLookup(userId: string): Promise<CardColorLookup> {
  const cards = await creditCardService.list(userId);
  const byId = new Map(cards.map((c) => [c.id, c.color ?? null]));
  const byKey = new Map(
    cards.map((c) => [`${c.issuer.toLowerCase()}:${c.last4}`, c.color ?? null]),
  );

  return new Map([...byId.entries(), ...byKey.entries()]);
}

function cardColorForStatement(
  lookup: CardColorLookup,
  statement: {
    creditCardId: string | null;
    issuerId: string;
    cardLast4: string;
  },
): string | null {
  if (statement.creditCardId) {
    const byId = lookup.get(statement.creditCardId);
    if (byId !== undefined) return byId;
  }
  return (
    lookup.get(`${statement.issuerId.toLowerCase()}:${statement.cardLast4}`) ??
    null
  );
}

export type SoaPeriodMode = "single" | "range";

export type SoaPeriodRecord = typeof soaPeriods.$inferSelect;

function monthOrdinal(month: number, year: number): number {
  return year * 12 + month;
}

function statementMonthOrdinalExpr() {
  return sql<number>`${soaStatements.statementYear} * 12 + ${soaStatements.statementMonth}`;
}

function statementsInPeriodWhere(
  userId: string,
  fromMonth: number,
  fromYear: number,
  toMonth: number,
  toYear: number,
) {
  const fromOrd = monthOrdinal(fromMonth, fromYear);
  const toOrd = monthOrdinal(toMonth, toYear);

  return and(
    eq(soaStatements.userId, userId),
    sql`${statementMonthOrdinalExpr()} >= ${fromOrd}`,
    sql`${statementMonthOrdinalExpr()} <= ${toOrd}`,
  );
}

function isMonthInRange(
  month: number,
  year: number,
  fromMonth: number,
  fromYear: number,
  toMonth: number,
  toYear: number,
): boolean {
  const value = monthOrdinal(month, year);
  return (
    value >= monthOrdinal(fromMonth, fromYear) &&
    value <= monthOrdinal(toMonth, toYear)
  );
}

function periodLabel(month: number, year: number): string {
  const names = [
    "January",
    "February",
    "March",
    "April",
    "May",
    "June",
    "July",
    "August",
    "September",
    "October",
    "November",
    "December",
  ];
  const name = names[month - 1];
  return name ? `${name} ${year}` : `${month}/${year}`;
}

export function formatSoaPeriodRange(period: {
  mode: string;
  fromMonth: number;
  fromYear: number;
  toMonth: number;
  toYear: number;
}): string {
  if (
    period.mode === "single" ||
    (period.fromMonth === period.toMonth && period.fromYear === period.toYear)
  ) {
    return periodLabel(period.fromMonth, period.fromYear);
  }
  return `${periodLabel(period.fromMonth, period.fromYear)} → ${periodLabel(period.toMonth, period.toYear)}`;
}

export function isMultiMonthPeriod(period: {
  mode: string;
  fromMonth: number;
  fromYear: number;
  toMonth: number;
  toYear: number;
}): boolean {
  if (period.mode === "range") return true;
  return (
    period.fromMonth !== period.toMonth || period.fromYear !== period.toYear
  );
}

function monthCoveredByMultiMonthPeriod(
  month: number,
  year: number,
  periods: SoaPeriodRecord[],
): boolean {
  return periods.some(
    (p) =>
      isMultiMonthPeriod(p) &&
      isMonthInRange(month, year, p.fromMonth, p.fromYear, p.toMonth, p.toYear),
  );
}

function redundantSinglePeriodIds(periods: SoaPeriodRecord[]): string[] {
  const multiMonth = periods.filter(isMultiMonthPeriod);
  if (multiMonth.length === 0) return [];

  return periods
    .filter((p) => !isMultiMonthPeriod(p))
    .filter((p) =>
      monthCoveredByMultiMonthPeriod(p.fromMonth, p.fromYear, multiMonth),
    )
    .map((p) => p.id);
}

function findCoveringMultiMonthPeriod(
  month: number,
  year: number,
  periods: SoaPeriodRecord[],
): SoaPeriodRecord | undefined {
  return periods.find(
    (p) =>
      isMultiMonthPeriod(p) &&
      isMonthInRange(month, year, p.fromMonth, p.fromYear, p.toMonth, p.toYear),
  );
}

async function aggregatePeriodStats(userId: string, period: SoaPeriodRecord) {
  await ensureDueEntryCardIdentity(userId);

  const [statements, dues] = await Promise.all([
    db.query.soaStatements.findMany({
      where: eq(soaStatements.userId, userId),
    }),
    db.query.dueEntries.findMany({
      where: eq(dueEntries.userId, userId),
    }),
  ]);

  const inRange = statements.filter((s) =>
    isMonthInRange(
      s.statementMonth,
      s.statementYear,
      period.fromMonth,
      period.fromYear,
      period.toMonth,
      period.toYear,
    ),
  );

  const enrichedDues = await enrichDueEntriesWithSoaPeriod(userId, dues);
  const dueRows: DuePaymentLookupRow[] = enrichedDues.map((due) => ({
    issuerId: due.issuerId,
    cardLast4: due.cardLast4,
    dueDateYmd: due.dueDateYmd,
    statementPeriodKey: due.statementPeriodKey,
    bankLabel: due.bankLabel,
    cardDisplayLabel: due.cardDisplayLabel,
    paidAt: due.paidAt,
    paidAmount: due.paidAmount,
    totalDue: due.totalDue,
    minimumDue: due.minimumDue,
  }));

  const outstanding = computeOutstandingTotals(inRange, dueRows);

  return {
    cardCount: outstanding.cardCount,
    paidCardCount: outstanding.paidCardCount,
    minimumMetCardCount: outstanding.minimumMetCardCount,
    statementCount: inRange.length,
    totalDue: outstanding.totalDue,
    totalMinimum: outstanding.totalMinimum,
    grossStatementDue: outstanding.grossStatementDue,
    grossMinimumDue: outstanding.grossMinimumDue,
    totalPaid: computeTotalPaid(inRange, dueRows),
    nextDueYmd: outstanding.nextDueYmd,
    periodCards: outstanding.cards,
  };
}

export const soaPeriodService = {
  /** Drop single-month periods that fall inside an existing range period. */
  async pruneRedundantSinglePeriods(userId: string) {
    const periods = await db.query.soaPeriods.findMany({
      where: eq(soaPeriods.userId, userId),
    });
    const deleteIds = redundantSinglePeriodIds(periods);
    if (deleteIds.length === 0) return { removed: 0 };

    await db.delete(soaPeriods).where(inArray(soaPeriods.id, deleteIds));
    return { removed: deleteIds.length };
  },

  async ensureBackfillFromStatements(userId: string) {
    const statements = await db.query.soaStatements.findMany({
      where: eq(soaStatements.userId, userId),
    });

    const existing = await db.query.soaPeriods.findMany({
      where: eq(soaPeriods.userId, userId),
    });
    const existingKeys = new Set(
      existing.map(
        (p) => `${p.fromYear}-${p.fromMonth}-${p.toYear}-${p.toMonth}`,
      ),
    );

    const monthKeys = new Map<string, { month: number; year: number }>();
    for (const s of statements) {
      const key = `${s.statementYear}-${s.statementMonth}`;
      if (!monthKeys.has(key)) {
        monthKeys.set(key, {
          month: s.statementMonth,
          year: s.statementYear,
        });
      }
    }

    for (const { month, year } of monthKeys.values()) {
      if (monthCoveredByMultiMonthPeriod(month, year, existing)) continue;

      const rangeKey = `${year}-${month}-${year}-${month}`;
      if (existingKeys.has(rangeKey)) continue;
      await db.insert(soaPeriods).values({
        userId,
        mode: "single",
        fromMonth: month,
        fromYear: year,
        toMonth: month,
        toYear: year,
        lastRunAt: new Date(),
      });
      existingKeys.add(rangeKey);
    }
  },

  async listPeriods(userId: string) {
    await this.ensureBackfillFromStatements(userId);

    const periods = await db.query.soaPeriods.findMany({
      where: eq(soaPeriods.userId, userId),
      orderBy: [
        desc(soaPeriods.lastRunAt),
        desc(soaPeriods.fromYear),
        desc(soaPeriods.fromMonth),
        desc(soaPeriods.createdAt),
      ],
    });

    const multiMonthPeriods = periods.filter(isMultiMonthPeriod);

    return Promise.all(
      periods.map(async (period) => {
        const stats = await aggregatePeriodStats(userId, period);
        const coveringRange = isMultiMonthPeriod(period)
          ? null
          : findCoveringMultiMonthPeriod(
              period.fromMonth,
              period.fromYear,
              multiMonthPeriods,
            );

        return {
          ...period,
          label: formatSoaPeriodRange(period),
          withinRangeLabel: coveringRange
            ? formatSoaPeriodRange(coveringRange)
            : null,
          ...stats,
        };
      }),
    );
  },

  async getStatement(userId: string, periodId: string, statementId: string) {
    const period = await db.query.soaPeriods.findFirst({
      where: and(eq(soaPeriods.id, periodId), eq(soaPeriods.userId, userId)),
    });
    if (!period) return null;

    const statement = await db.query.soaStatements.findFirst({
      where: and(
        eq(soaStatements.id, statementId),
        eq(soaStatements.userId, userId),
      ),
      with: { transactions: true },
    });
    if (!statement) return null;

    const inRange = isMonthInRange(
      statement.statementMonth,
      statement.statementYear,
      period.fromMonth,
      period.fromYear,
      period.toMonth,
      period.toYear,
    );
    if (!inRange) return null;

    const transactions = await transactionCategoryService.enrichTransactions(
      userId,
      statement.transactions,
    );
    const cardColors = await loadCardColorLookup(userId);

    return {
      period: {
        ...period,
        label: formatSoaPeriodRange(period),
      },
      statement: {
        ...statement,
        transactions,
        cardColor: cardColorForStatement(cardColors, statement),
      },
    };
  },

  async getPeriod(userId: string, periodId: string) {
    const period = await db.query.soaPeriods.findFirst({
      where: and(eq(soaPeriods.id, periodId), eq(soaPeriods.userId, userId)),
    });
    if (!period) return null;

    const statements = await db.query.soaStatements.findMany({
      where: statementsInPeriodWhere(
        userId,
        period.fromMonth,
        period.fromYear,
        period.toMonth,
        period.toYear,
      ),
      orderBy: [desc(soaStatements.createdAt)],
      with: { transactions: true },
    });

    const stats = await aggregatePeriodStats(userId, period);
    const cardColors = await loadCardColorLookup(userId);

    const enrichedStatements = await Promise.all(
      statements.map(async (statement) => ({
        ...statement,
        cardColor: cardColorForStatement(cardColors, statement),
        transactions: await transactionCategoryService.enrichTransactions(
          userId,
          statement.transactions,
        ),
      })),
    );

    return {
      ...period,
      label: formatSoaPeriodRange(period),
      ...stats,
      statements: enrichedStatements,
    };
  },

  /** Return the period the user just ran — do not redirect singles into a covering range. */
  async resolveNavigationPeriodId(
    _userId: string,
    period: SoaPeriodRecord,
  ): Promise<string> {
    return period.id;
  },

  async upsertPeriod(
    userId: string,
    input: {
      mode: SoaPeriodMode;
      fromMonth: number;
      fromYear: number;
      toMonth: number;
      toYear: number;
      notifyTelegram: boolean;
      notifySlack: boolean;
      createCalendar: boolean;
    },
  ) {
    const allPeriods = await db.query.soaPeriods.findMany({
      where: eq(soaPeriods.userId, userId),
    });

    const existing = allPeriods.find(
      (period) =>
        period.fromMonth === input.fromMonth &&
        period.fromYear === input.fromYear &&
        period.toMonth === input.toMonth &&
        period.toYear === input.toYear,
    );

    if (existing) {
      const [updated] = await db
        .update(soaPeriods)
        .set({
          mode: input.mode,
          notifyTelegram: input.notifyTelegram,
          notifySlack: input.notifySlack,
          createCalendar: input.createCalendar,
          lastRunAt: new Date(),
        })
        .where(eq(soaPeriods.id, existing.id))
        .returning();

      return updated!;
    }

    const [created] = await db
      .insert(soaPeriods)
      .values({
        userId,
        mode: input.mode,
        fromMonth: input.fromMonth,
        fromYear: input.fromYear,
        toMonth: input.toMonth,
        toYear: input.toYear,
        notifyTelegram: input.notifyTelegram,
        notifySlack: input.notifySlack,
        createCalendar: input.createCalendar,
        lastRunAt: new Date(),
      })
      .returning();

    return created!;
  },

  async updatePeriod(
    userId: string,
    periodId: string,
    input: {
      notifyTelegram?: boolean;
      notifySlack?: boolean;
      createCalendar?: boolean;
    },
  ) {
    const [updated] = await db
      .update(soaPeriods)
      .set(input)
      .where(and(eq(soaPeriods.id, periodId), eq(soaPeriods.userId, userId)))
      .returning();
    return updated ?? null;
  },

  async deletePeriod(userId: string, periodId: string) {
    const period = await db.query.soaPeriods.findFirst({
      where: and(eq(soaPeriods.id, periodId), eq(soaPeriods.userId, userId)),
    });
    if (!period) return { removed: 0 };

    const statements = await db.query.soaStatements.findMany({
      where: eq(soaStatements.userId, userId),
    });

    const deleteIds = statements
      .filter((s) =>
        isMonthInRange(
          s.statementMonth,
          s.statementYear,
          period.fromMonth,
          period.fromYear,
          period.toMonth,
          period.toYear,
        ),
      )
      .map((s) => s.id);

    if (deleteIds.length > 0) {
      await db
        .delete(soaStatements)
        .where(inArray(soaStatements.id, deleteIds));
    }

    await db
      .delete(soaPeriods)
      .where(and(eq(soaPeriods.id, periodId), eq(soaPeriods.userId, userId)));

    return { removed: deleteIds.length };
  },
};
