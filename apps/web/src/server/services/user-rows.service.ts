import "server-only";

import { and, eq, isNull } from "drizzle-orm";

import { db } from "@/lib/db";
import { creditCards, dueEntries, soaStatements } from "@/lib/db/schema";
import {
  cachedPerRequest,
  invalidateRequestCache,
} from "@/server/lib/request-cache";

/**
 * Shared per-request loaders for the user-scoped row sets that nearly every
 * dashboard read touches.
 *
 * These tables are small per user but were being re-queried by each service in
 * a batch, so a single overview request issued the same statement three or four
 * times. Loading the full set once and filtering in memory removes those round
 * trips; the read paths that repair rows call the matching invalidate helper so
 * later callers still observe their writes.
 */

const DUE_ENTRY_ROWS = "rows.dueEntries";
const SOA_STATEMENT_ROWS = "rows.soaStatements";
const CREDIT_CARD_ROWS = "rows.creditCards";

/** All due entries for a user, ordered by due date. Callers filter in memory. */
export const loadDueEntryRows = cachedPerRequest(
  DUE_ENTRY_ROWS,
  (userId: string) =>
    db.query.dueEntries.findMany({
      where: eq(dueEntries.userId, userId),
      orderBy: (t, { asc }) => [asc(t.dueDateYmd)],
    }),
);

export const loadSoaStatementRows = cachedPerRequest(
  SOA_STATEMENT_ROWS,
  (userId: string) =>
    db.query.soaStatements.findMany({
      where: eq(soaStatements.userId, userId),
    }),
);

export const loadCreditCardRows = cachedPerRequest(
  CREDIT_CARD_ROWS,
  (userId: string) =>
    db.query.creditCards.findMany({
      where: and(eq(creditCards.userId, userId), isNull(creditCards.deletedAt)),
    }),
);

export function invalidateDueEntryRows(): void {
  invalidateRequestCache(DUE_ENTRY_ROWS);
}

export function invalidateSoaStatementRows(): void {
  invalidateRequestCache(SOA_STATEMENT_ROWS);
}

export function invalidateCreditCardRows(): void {
  invalidateRequestCache(CREDIT_CARD_ROWS);
}
