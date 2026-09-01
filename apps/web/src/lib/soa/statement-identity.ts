import { normalizeCardLast4 } from "@/lib/due/normalize";

/** Fields that identify one persisted SOA statement row for a user + period. */
export type SoaStatementIdentity = {
  issuerId: string;
  cardLast4: string;
  statementMonth: number;
  statementYear: number;
};

/**
 * One statement per card per billing period — this is the canonical identity
 * used both to find-or-update rows on persist and to de-duplicate existing
 * rows. It intentionally ignores `sourceMessageId`/`pdfFileName`: those differ
 * between an "unavailable" placeholder (no SOA email found) and the real
 * statement parsed on a later run, and using them as part of the identity is
 * what previously let both rows exist side by side for the same card+period.
 */
export function soaStatementIdentityKey(row: SoaStatementIdentity): string {
  return [
    row.issuerId.toLowerCase(),
    normalizeCardLast4(row.cardLast4),
    row.statementYear,
    row.statementMonth,
  ].join(":");
}
