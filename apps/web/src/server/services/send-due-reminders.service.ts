import { eq } from "drizzle-orm";

import { reminderFingerprint } from "@/lib/reminders/fingerprint";
import {
  buildSlackReminderMessage,
  buildTelegramReminderMessage,
  type DueReminderEntry,
} from "@/lib/reminders/reminder-messages";
import { daysUntilYmd, todayYmdLocal } from "@/lib/reminders/reminder-status";
import { db } from "@/lib/db";
import { dueEntries } from "@/lib/db/schema";
import { creditCardService } from "./credit-card.service";
import { integrationService } from "./integration.service";
import { notificationService } from "./notification.service";
import { reminderLogService } from "./reminder-log.service";
import { ReminderRunProgressReporter } from "./reminder-run-progress.service";
import { expectedDueEntryService } from "./expected-due-entry.service";
import { googleCalendarService } from "./google-calendar.service";

const DEFAULT_WINDOW_DAYS = Math.max(
  0,
  Number(process.env.DUE_REMINDERS_WINDOW_DAYS ?? "4") || 4,
);
const EXPECTED_DUE_OVERDUE_DAYS = 7;

function cardKey(issuerId: string, last4: string) {
  return `${issuerId.toLowerCase()}:${last4}`;
}

type SendDueRemindersOptions = {
  force?: boolean;
  asOfYmd?: string;
  processId?: string;
};

export type SendDueRemindersResult = {
  sent: number;
  skipped: number;
  failed: number;
};

export const sendDueRemindersService = {
  async sendForUser(
    userId: string,
    options: SendDueRemindersOptions = {},
  ): Promise<SendDueRemindersResult> {
    const asOf = options.asOfYmd ?? todayYmdLocal();
    const force = options.force ?? false;

    const reporter = options.processId
      ? await ReminderRunProgressReporter.create(userId, options.processId)
      : null;

    try {
      await reporter?.activate("prepare", "Loading due entries");
      await expectedDueEntryService.ensureForUser(userId, { asOfYmd: asOf });

      const dues = await db.query.dueEntries.findMany({
        where: eq(dueEntries.userId, userId),
        orderBy: (table, { asc }) => [asc(table.dueDateYmd)],
      });

      if (!dues.length) {
        await reporter?.complete("No due entries found");
        return { sent: 0, skipped: 0, failed: 0 };
      }

      const cards = await creditCardService.list(userId);
      const cardSettings = new Map(
        cards.map((card) => [
          cardKey(card.issuer, card.last4),
          {
            windowDays: card.reminderWindowDays ?? DEFAULT_WINDOW_DAYS,
            intervalMinutes: card.reminderIntervalMinutes ?? 1440,
          },
        ]),
      );

      await reporter?.completeStep("prepare");
      await reporter?.activate("channels", "Checking Telegram and Slack");

      const telegram = await integrationService.getConfig<{
        webLink?: string;
      }>(userId, "telegram");
      const webLink = telegram?.webLink;

      const configured = await notificationService.isConfigured(userId);

      await reporter?.completeStep("channels");
      await reporter?.activate("evaluate", "Finding cards in reminder window");

      let sent = 0;
      let skipped = 0;
      let failed = 0;

      const plans: Array<{
        entry: DueReminderEntry;
        daysAway: number;
        fingerprint: string;
        intervalMinutes: number;
      }> = [];

      for (const due of dues) {
        if (due.paidAt) continue;

        const settings =
          cardSettings.get(cardKey(due.issuerId, due.cardLast4)) ??
          ({ windowDays: DEFAULT_WINDOW_DAYS, intervalMinutes: 1440 } as const);
        const daysAway = daysUntilYmd(due.dueDateYmd, asOf);
        if (
          daysAway > settings.windowDays ||
          (daysAway < 0 &&
            (due.source !== "expected" ||
              daysAway < -EXPECTED_DUE_OVERDUE_DAYS))
        ) {
          continue;
        }

        plans.push({
          entry: {
            issuerId: due.issuerId,
            cardLast4: due.cardLast4,
            bankLabel: due.bankLabel,
            cardDisplayLabel: due.cardDisplayLabel,
            dueDate: due.dueDate,
            dueDateYmd: due.dueDateYmd,
            minimumDue: due.minimumDue,
            totalDue: due.totalDue,
            interestCharges: due.interestCharges,
            contactLine: due.contactLine,
            fullPan: due.fullPan,
            source: due.source,
          },
          daysAway,
          fingerprint: reminderFingerprint({
            issuerId: due.issuerId,
            cardLast4: due.cardLast4,
            dueDateYmd: due.dueDateYmd,
            daysAway,
          }),
          intervalMinutes: settings.intervalMinutes,
        });
      }

      plans.sort((a, b) => a.daysAway - b.daysAway);

      const calendar = await integrationService.getConfig(
        userId,
        "google_calendar",
      );
      const expectedRows = plans
        .filter((plan) => plan.entry.source === "expected")
        .map((plan) => ({
          ...plan.entry,
          dueDateYMD: plan.entry.dueDateYmd,
          updatedAt: new Date().toISOString(),
        }));
      if (calendar && expectedRows.length > 0) {
        try {
          await googleCalendarService.createDueDateEvents(userId, expectedRows);
        } catch {
          // Reminder delivery should continue when Calendar sync is unavailable.
        }
      }

      await reporter?.setDetail(
        plans.length
          ? `${plans.length} card${plans.length === 1 ? "" : "s"} in window`
          : "No cards in reminder window today",
      );
      await reporter?.completeStep("evaluate");
      await reporter?.activate("send", "Sending reminders");

      for (const plan of plans) {
        const label =
          plan.entry.cardDisplayLabel ??
          `${plan.entry.bankLabel} ···${plan.entry.cardLast4}`;
        await reporter?.setDetail(`Sending ${label}`);

        const alreadySent = force
          ? false
          : await reminderLogService.hasBeenSent(
              userId,
              plan.fingerprint,
              plan.intervalMinutes,
            );

        if (alreadySent) {
          skipped++;
          continue;
        }

        if (!configured) {
          skipped++;
          continue;
        }

        try {
          const telegramText = buildTelegramReminderMessage(
            plan.entry,
            plan.daysAway,
            webLink,
          );
          const slackText = buildSlackReminderMessage(
            plan.entry,
            plan.daysAway,
            webLink,
          );
          const channels = await notificationService.sendReminderText(
            userId,
            telegramText,
            slackText,
          );
          const channelLabel = [
            channels.telegram && "telegram",
            channels.slack && "slack",
          ]
            .filter(Boolean)
            .join("+");
          await reminderLogService.markSent(
            userId,
            plan.fingerprint,
            channelLabel || "unknown",
          );
          sent++;
        } catch {
          failed++;
        }
      }

      await reporter?.completeStep("send");
      await reporter?.complete(
        sent > 0
          ? `Sent ${sent} reminder${sent === 1 ? "" : "s"}`
          : plans.length
            ? "No new reminders sent"
            : "Nothing to send today",
      );

      return { sent, skipped, failed };
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Reminder run failed";
      await reporter?.fail(message);
      throw error;
    }
  },
};
