import { and, desc, eq, inArray } from "drizzle-orm";

import { reminderFingerprint } from "@/lib/reminders/fingerprint";
import { db } from "@/lib/db";
import { reminderLogs } from "@/lib/db/schema";

export const reminderLogService = {
  async hasBeenSent(
    userId: string,
    fingerprint: string,
    intervalMinutes = 1440,
  ): Promise<boolean> {
    const row = await db.query.reminderLogs.findFirst({
      where: and(
        eq(reminderLogs.userId, userId),
        eq(reminderLogs.fingerprint, fingerprint),
      ),
      orderBy: [desc(reminderLogs.sentAt)],
    });
    if (!row) return false;
    if (intervalMinutes >= 1440) return true;
    return Date.now() - row.sentAt.getTime() < intervalMinutes * 60_000;
  },

  async markSent(userId: string, fingerprint: string, channel: string) {
    await db.insert(reminderLogs).values({
      userId,
      fingerprint,
      channel,
      status: "sent",
    });
  },

  async suppressForDueEntry(
    userId: string,
    entry: {
      issuerId: string;
      cardLast4: string;
      dueDateYmd: string;
    },
    maxWindowDays = 10,
  ) {
    let suppressed = 0;
    for (let daysAway = 0; daysAway <= maxWindowDays; daysAway++) {
      const fingerprint = reminderFingerprint({
        issuerId: entry.issuerId,
        cardLast4: entry.cardLast4,
        dueDateYmd: entry.dueDateYmd,
        daysAway,
      });
      if (!(await this.hasBeenSent(userId, fingerprint))) {
        await this.markSent(userId, fingerprint, "suppressed");
        suppressed++;
      }
    }
    return suppressed;
  },

  async clearForDueEntry(
    userId: string,
    entry: {
      issuerId: string;
      cardLast4: string;
      dueDateYmd: string;
    },
    maxWindowDays = 10,
  ) {
    const fingerprints = Array.from({ length: maxWindowDays + 1 }, (_, d) =>
      reminderFingerprint({
        issuerId: entry.issuerId,
        cardLast4: entry.cardLast4,
        dueDateYmd: entry.dueDateYmd,
        daysAway: d,
      }),
    );

    await db
      .delete(reminderLogs)
      .where(
        and(
          eq(reminderLogs.userId, userId),
          inArray(reminderLogs.fingerprint, fingerprints),
        ),
      );

    return fingerprints.length;
  },
};
