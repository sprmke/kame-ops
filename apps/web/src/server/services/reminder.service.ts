import { eq } from "drizzle-orm";

import { db } from "@/lib/db";
import { dueEntries } from "@/lib/db/schema";
import {
  alreadySentRemindersMessage,
  noRemindersTodayMessage,
} from "@/lib/reminders/reminder-labels";
import {
  buildReminderCardStatus,
  todayYmdLocal,
  type ReminderCardStatus,
} from "@/lib/reminders/reminder-status";
import { creditCardService } from "./credit-card.service";
import { dueSyncService } from "./due-sync.service";
import { prepareLegacyRuntime } from "./legacy-runtime.service";

const DEFAULT_WINDOW_DAYS = Math.max(
  0,
  Number(process.env.DUE_REMINDERS_WINDOW_DAYS ?? "4") || 4,
);

function cardKey(issuerId: string, last4: string) {
  return `${issuerId.toLowerCase()}:${last4}`;
}

export const reminderService = {
  async listDueEntries(userId: string, unpaidOnly = true) {
    const rows = await db.query.dueEntries.findMany({
      where: eq(dueEntries.userId, userId),
      orderBy: (t, { asc }) => [asc(t.dueDateYmd)],
    });
    if (!unpaidOnly) return rows;
    return rows.filter((r) => !r.paidAt);
  },

  async getReminderStatus(userId: string): Promise<{
    asOf: string;
    defaultWindowDays: number;
    cards: ReminderCardStatus[];
    inWindowCount: number;
    readyCount: number;
  }> {
    await prepareLegacyRuntime(userId);

    const dues = await db.query.dueEntries.findMany({
      where: eq(dueEntries.userId, userId),
      orderBy: (t, { asc }) => [asc(t.dueDateYmd)],
    });
    const cards = await creditCardService.list(userId);
    const cardSettings = new Map(
      cards.map((c) => [
        cardKey(c.issuer, c.last4),
        {
          windowDays: c.reminderWindowDays ?? DEFAULT_WINDOW_DAYS,
        },
      ]),
    );

    const { loadState, reminderFingerprint, hasReminderBeenSent } =
      await import("@/server/legacy/pay-credit-cards/due-reminders-state");
    const state = loadState();
    const asOf = todayYmdLocal();

    const statuses = dues.map((d) => {
      const windowDays =
        cardSettings.get(cardKey(d.issuerId, d.cardLast4))?.windowDays ??
        DEFAULT_WINDOW_DAYS;
      const daysAway = Math.round(
        (new Date(`${d.dueDateYmd}T00:00:00`).getTime() -
          new Date(`${asOf}T00:00:00`).getTime()) /
          86_400_000,
      );
      const fp =
        daysAway >= 0 && daysAway <= windowDays
          ? reminderFingerprint(
              {
                issuerId: d.issuerId,
                cardLast4: d.cardLast4,
                dueDateYMD: d.dueDateYmd,
              } as never,
              daysAway,
            )
          : null;

      return buildReminderCardStatus({
        dueEntryId: d.id,
        bankLabel: d.bankLabel,
        cardLast4: d.cardLast4,
        cardDisplayLabel: d.cardDisplayLabel,
        dueDate: d.dueDate,
        dueDateYmd: d.dueDateYmd,
        paidAt: d.paidAt,
        windowDays,
        asOfYmd: asOf,
        alreadySentToday: fp ? hasReminderBeenSent(state, fp) : false,
      });
    });

    return {
      asOf,
      defaultWindowDays: DEFAULT_WINDOW_DAYS,
      cards: statuses,
      inWindowCount: statuses.filter((s) => s.inWindow).length,
      readyCount: statuses.filter((s) => s.status === "in_window_ready").length,
    };
  },

  async sendDueRemindersForUser(userId: string, options?: { force?: boolean }) {
    await prepareLegacyRuntime(userId);

    const { runSendReminders } =
      await import("@/server/legacy/pay-credit-cards/send-reminders");
    const result = await runSendReminders({
      skipBanner: true,
      force: options?.force,
    });

    if (process.env.DATA_DIR) {
      await dueSyncService.syncFromLegacyFile(userId, process.env.DATA_DIR);
    }

    const status = await this.getReminderStatus(userId);

    return {
      ...result,
      readyCount: status.readyCount,
      inWindowCount: status.inWindowCount,
      message:
        result.sent === 0
          ? status.inWindowCount === 0
            ? noRemindersTodayMessage()
            : alreadySentRemindersMessage(status.inWindowCount)
          : undefined,
    };
  },
};
