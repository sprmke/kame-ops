import { and, count, desc, eq, isNull, sql } from "drizzle-orm";

import { db } from "@/lib/db";
import {
  automationJobs,
  automationRuns,
  creditCards,
  dueEntries,
  soaStatements,
} from "@/lib/db/schema";

export const overviewService = {
  async getStats(userId: string) {
    const [cardsCount] = await db
      .select({ value: count() })
      .from(creditCards)
      .where(
        and(eq(creditCards.userId, userId), isNull(creditCards.deletedAt)),
      );

    const [unpaidCount] = await db
      .select({ value: count() })
      .from(dueEntries)
      .where(and(eq(dueEntries.userId, userId), isNull(dueEntries.paidAt)));

    const [statementsCount] = await db
      .select({ value: count() })
      .from(soaStatements)
      .where(eq(soaStatements.userId, userId));

    const [jobsCount] = await db
      .select({ value: count() })
      .from(automationJobs)
      .where(
        and(
          eq(automationJobs.userId, userId),
          eq(automationJobs.isActive, true),
        ),
      );

    const recentRuns = await db.query.automationRuns.findMany({
      where: eq(automationRuns.userId, userId),
      orderBy: [desc(automationRuns.startedAt)],
      limit: 5,
      with: { job: { columns: { name: true, jobType: true } } },
    });

    const upcomingDues = await db.query.dueEntries.findMany({
      where: and(eq(dueEntries.userId, userId), isNull(dueEntries.paidAt)),
      orderBy: [dueEntries.dueDateYmd],
      limit: 5,
    });

    const lastSoa = await db.query.soaStatements.findFirst({
      where: eq(soaStatements.userId, userId),
      orderBy: [desc(soaStatements.createdAt)],
    });

    return {
      cards: cardsCount?.value ?? 0,
      unpaidDues: unpaidCount?.value ?? 0,
      statements: statementsCount?.value ?? 0,
      activeAutomations: jobsCount?.value ?? 0,
      recentRuns,
      upcomingDues,
      lastSoaAt: lastSoa?.createdAt ?? null,
    };
  },
};
