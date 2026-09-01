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
import { loadDueEntryRows } from "./user-rows.service";
import { ensureDefaultAutomationJobs } from "./default-automation.service";
import { creditCardService } from "./credit-card.service";
import { expectedDueEntryService } from "./expected-due-entry.service";
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
const EXPECTED_DUE_OVERDUE_DAYS = 7;

function cardKey(issuerId: string, last4: string) {
  return `${issuerId.toLowerCase()}:${last4}`;
}

export const reminderService = {
  async listDueEntries(userId: string, unpaidOnly = true) {
    await Promise.all([
      ensureDefaultAutomationJobs(userId),
      expectedDueEntryService.ensureForUser(userId),
    ]);
    const rows = await listDueEntriesWithCorrectIdentity(userId, unpaidOnly);
    const asOf = todayYmdLocal();
    return rows.filter(
      (row) =>
        row.source !== "expected" ||
        daysUntilYmd(row.dueDateYmd, asOf) >= -EXPECTED_DUE_OVERDUE_DAYS,
    );
  },

  async getReminderStatus(userId: string): Promise<{
    asOf: string;
    defaultWindowDays: number;
    cards: ReminderCardStatus[];
    inWindowCount: number;
    readyCount: number;
  }> {
    await Promise.all([
      ensureDefaultAutomationJobs(userId),
      ensureDueEntryCardIdentity(userId),
      expectedDueEntryService.ensureForUser(userId),
    ]);

    const [dues, cards] = await Promise.all([
      loadDueEntryRows(userId),
      creditCardService.list(userId),
    ]);
    const cardSettings = new Map(
      cards.map((c) => [
        cardKey(c.issuer, c.last4),
        {
          windowDays: c.reminderWindowDays ?? DEFAULT_WINDOW_DAYS,
        },
      ]),
    );

    const asOf = todayYmdLocal();

    const evaluated = dues.map((d) => {
      const windowDays =
        cardSettings.get(cardKey(d.issuerId, d.cardLast4))?.windowDays ??
        DEFAULT_WINDOW_DAYS;
      const daysAway = daysUntilYmd(d.dueDateYmd, asOf);
      const inWindow =
        (daysAway >= 0 && daysAway <= windowDays) ||
        (d.source === "expected" &&
          daysAway < 0 &&
          daysAway >= -EXPECTED_DUE_OVERDUE_DAYS);

      return {
        due: d,
        windowDays,
        daysAway,
        fingerprint: inWindow
          ? reminderFingerprint({
              issuerId: d.issuerId,
              cardLast4: d.cardLast4,
              dueDateYmd: d.dueDateYmd,
              daysAway,
            })
          : null,
      };
    });

    const sentFingerprints = await reminderLogService.findSentFingerprints(
      userId,
      evaluated
        .map((e) => e.fingerprint)
        .filter((fp): fp is string => fp !== null),
    );

    const statuses = evaluated.map(
      ({ due: d, windowDays, daysAway, fingerprint }) =>
        buildReminderCardStatus({
          dueEntryId: d.id,
          bankLabel: d.bankLabel,
          cardLast4: d.cardLast4,
          cardDisplayLabel: d.cardDisplayLabel,
          dueDate: d.dueDate,
          dueDateYmd: d.dueDateYmd,
          paidAt: d.paidAt,
          windowDays,
          asOfYmd: asOf,
          alreadySentToday:
            fingerprint !== null && sentFingerprints.has(fingerprint),
          includeOverdue:
            d.source === "expected" && daysAway >= -EXPECTED_DUE_OVERDUE_DAYS,
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
