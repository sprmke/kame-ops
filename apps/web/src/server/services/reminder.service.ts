import { eq } from "drizzle-orm";

import { reminderFingerprint } from "@/lib/reminders/fingerprint";
import {
  alreadySentRemindersMessage,
  noRemindersTodayMessage,
} from "@/lib/reminders/reminder-labels";
import {
  buildReminderCardStatus,
  daysUntilYmd,
  todayYmdLocal,
  type ReminderCardStatus,
} from "@/lib/reminders/reminder-status";
import { db } from "@/lib/db";
import { dueEntries } from "@/lib/db/schema";
import { ensureDefaultAutomationJobs } from "./default-automation.service";
import { creditCardService } from "./credit-card.service";
import {
  ensureDueEntryCardIdentity,
  listDueEntriesWithCorrectIdentity,
} from "./statement-card-identity.service";
import { reminderLogService } from "./reminder-log.service";
import { sendDueRemindersService } from "./send-due-reminders.service";

const DEFAULT_WINDOW_DAYS = Math.max(
  0,
  Number(process.env.DUE_REMINDERS_WINDOW_DAYS ?? "4") || 4,
);

function cardKey(issuerId: string, last4: string) {
  return `${issuerId.toLowerCase()}:${last4}`;
}

export const reminderService = {
  async listDueEntries(userId: string, unpaidOnly = true) {
    await ensureDefaultAutomationJobs(userId);
    return listDueEntriesWithCorrectIdentity(userId, unpaidOnly);
  },

  async getReminderStatus(userId: string): Promise<{
    asOf: string;
    defaultWindowDays: number;
    cards: ReminderCardStatus[];
    inWindowCount: number;
    readyCount: number;
  }> {
    await ensureDefaultAutomationJobs(userId);
    await ensureDueEntryCardIdentity(userId);

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

    const asOf = todayYmdLocal();

    const statuses = await Promise.all(
      dues.map(async (d) => {
        const windowDays =
          cardSettings.get(cardKey(d.issuerId, d.cardLast4))?.windowDays ??
          DEFAULT_WINDOW_DAYS;
        const daysAway = daysUntilYmd(d.dueDateYmd, asOf);
        let alreadySentToday = false;

        if (daysAway >= 0 && daysAway <= windowDays) {
          const fp = reminderFingerprint({
            issuerId: d.issuerId,
            cardLast4: d.cardLast4,
            dueDateYmd: d.dueDateYmd,
            daysAway,
          });
          alreadySentToday = await reminderLogService.hasBeenSent(userId, fp);
        }

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
          alreadySentToday,
        });
      }),
    );

    return {
      asOf,
      defaultWindowDays: DEFAULT_WINDOW_DAYS,
      cards: statuses,
      inWindowCount: statuses.filter((s) => s.inWindow).length,
      readyCount: statuses.filter((s) => s.status === "in_window_ready").length,
    };
  },

  async sendDueRemindersForUser(
    userId: string,
    options?: { force?: boolean; processId?: string },
  ) {
    const result = await sendDueRemindersService.sendForUser(userId, options);
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
