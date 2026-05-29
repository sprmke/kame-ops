import { readFile } from "fs/promises";
import { join } from "path";
import { and, eq } from "drizzle-orm";

import { db } from "@/lib/db";
import { dueEntries } from "@/lib/db/schema";

interface LegacyDueEntry {
  issuerId: string;
  cardLast4: string;
  bankLabel: string;
  cardDisplayLabel?: string;
  fullPan?: string;
  dueDate: string;
  dueDateYMD: string;
  minimumDue: string;
  totalDue: string;
  interestCharges?: string;
  contactLine?: string;
  paidAt?: string;
}

interface LegacyDueState {
  dues: LegacyDueEntry[];
}

export const dueSyncService = {
  async syncFromLegacyFile(userId: string, dataDir: string) {
    const statePath = join(dataDir, "due-reminders-state.json");
    let state: LegacyDueState;
    try {
      const raw = await readFile(statePath, "utf8");
      state = JSON.parse(raw) as LegacyDueState;
    } catch {
      return { synced: 0 };
    }

    let synced = 0;
    for (const entry of state.dues ?? []) {
      const existing = await db.query.dueEntries.findFirst({
        where: and(
          eq(dueEntries.userId, userId),
          eq(dueEntries.issuerId, entry.issuerId),
          eq(dueEntries.cardLast4, entry.cardLast4),
        ),
      });

      if (existing) {
        if (entry.dueDateYMD >= existing.dueDateYmd) {
          await db
            .update(dueEntries)
            .set({
              dueDate: entry.dueDate,
              dueDateYmd: entry.dueDateYMD,
              minimumDue: entry.minimumDue,
              totalDue: entry.totalDue,
              interestCharges: entry.interestCharges,
              contactLine: entry.contactLine,
              cardDisplayLabel: entry.cardDisplayLabel,
              fullPan: entry.fullPan,
              paidAt: entry.paidAt ? new Date(entry.paidAt) : existing.paidAt,
            })
            .where(eq(dueEntries.id, existing.id));
          synced++;
        }
        continue;
      }

      await db.insert(dueEntries).values({
        userId,
        issuerId: entry.issuerId,
        cardLast4: entry.cardLast4,
        bankLabel: entry.bankLabel,
        cardDisplayLabel: entry.cardDisplayLabel,
        fullPan: entry.fullPan,
        dueDate: entry.dueDate,
        dueDateYmd: entry.dueDateYMD,
        minimumDue: entry.minimumDue,
        totalDue: entry.totalDue,
        interestCharges: entry.interestCharges,
        contactLine: entry.contactLine,
        paidAt: entry.paidAt ? new Date(entry.paidAt) : undefined,
      });
      synced++;
    }

    return { synced };
  },
};
