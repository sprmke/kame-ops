import { and, eq, isNull } from "drizzle-orm";

import { normalizeCardLast4 } from "@/lib/due/normalize";
import { db } from "@/lib/db";
import { dueEntries } from "@/lib/db/schema";

export type DueEntryRow = typeof dueEntries.$inferSelect;

export const dueEntryQueryService = {
  async findByCardAndMonth(
    userId: string,
    cardLast4: string,
    monthYM: string,
  ): Promise<DueEntryRow | DueEntryRow[] | null> {
    const lastNorm = normalizeCardLast4(cardLast4);
    const rows = await db.query.dueEntries.findMany({
      where: eq(dueEntries.userId, userId),
    });
    const matches = rows.filter(
      (d) =>
        normalizeCardLast4(d.cardLast4) === lastNorm &&
        d.dueDateYmd.startsWith(monthYM),
    );
    if (matches.length === 0) return null;
    if (matches.length === 1) return matches[0]!;
    return matches;
  },

  async findNearestUnpaidByLast4(
    userId: string,
    cardLast4: string,
  ): Promise<DueEntryRow | DueEntryRow[] | null | "already_paid"> {
    const lastNorm = normalizeCardLast4(cardLast4);
    const all = await db.query.dueEntries.findMany({
      where: eq(dueEntries.userId, userId),
    });
    const forCard = all.filter(
      (d) => normalizeCardLast4(d.cardLast4) === lastNorm,
    );
    if (forCard.length === 0) return null;

    const unpaid = forCard.filter((d) => !d.paidAt);
    if (unpaid.length === 0) return "already_paid";

    const today = new Date().toISOString().slice(0, 10);
    const daysUntil = (ymd: string) => {
      const a = new Date(`${ymd}T12:00:00`);
      const b = new Date(`${today}T12:00:00`);
      return Math.round((a.getTime() - b.getTime()) / 86_400_000);
    };

    const byIssuer = new Map<string, DueEntryRow>();
    for (const d of unpaid) {
      const existing = byIssuer.get(d.issuerId);
      if (!existing) {
        byIssuer.set(d.issuerId, d);
        continue;
      }
      const curDist = Math.abs(daysUntil(d.dueDateYmd));
      const prevDist = Math.abs(daysUntil(existing.dueDateYmd));
      if (curDist < prevDist) byIssuer.set(d.issuerId, d);
    }

    const picks = Array.from(byIssuer.values());
    if (picks.length === 1) return picks[0]!;
    return picks;
  },

  async listUnpaid(userId: string) {
    return db.query.dueEntries.findMany({
      where: and(eq(dueEntries.userId, userId), isNull(dueEntries.paidAt)),
    });
  },
};
