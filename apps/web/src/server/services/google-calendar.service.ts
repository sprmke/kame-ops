import { eq } from "drizzle-orm";

import { GOOGLE_OAUTH_SCOPES } from "@/lib/auth/google-scopes";
import { db } from "@/lib/db";
import { users } from "@/lib/db/schema";
import { todayYmdInTimezone } from "@/lib/soa/calendar-dates";
import { applyIntegrationsToEnv } from "./integration-env.service";
import { gmailService } from "./gmail.service";
import { integrationService } from "./integration.service";
import type { DueEntryRow } from "./due-entry-query.service";
import type { CalendarDueEntry } from "@/lib/soa/google-calendar";

function toCalendarDueEntry(entry: DueEntryRow): CalendarDueEntry {
  return {
    issuerId: entry.issuerId,
    cardLast4: entry.cardLast4,
    bankLabel: entry.bankLabel,
    cardDisplayLabel: entry.cardDisplayLabel ?? undefined,
    dueDate: entry.dueDate,
    dueDateYMD: entry.dueDateYmd,
    minimumDue: entry.minimumDue,
    totalDue: entry.totalDue,
    updatedAt: entry.updatedAt.toISOString(),
  };
}

function assertCalendarScope(): void {
  const tokenJson = process.env.GMAIL_TOKEN_JSON;
  if (!tokenJson) return;
  try {
    const parsed = JSON.parse(tokenJson) as { scope?: string };
    const scope = parsed.scope ?? "";
    const hasCalendar = GOOGLE_OAUTH_SCOPES.some(
      (s) => s.includes("calendar") && scope.includes(s),
    );
    if (!hasCalendar && !scope.includes("calendar.events")) {
      throw new Error(
        "Google Calendar permission is missing. Sign out and sign in again with Google to grant Calendar access.",
      );
    }
  } catch (error) {
    if (error instanceof Error && error.message.includes("Calendar")) {
      throw error;
    }
  }
}

async function resolveUserTimezone(userId: string): Promise<string> {
  const user = await db.query.users.findFirst({
    where: eq(users.id, userId),
    columns: { timezone: true },
  });
  return user?.timezone?.trim() || "Asia/Manila";
}
async function prepareCalendarEnv(userId: string): Promise<string> {
  await applyIntegrationsToEnv(userId);
  await gmailService.applyTokensToEnv(userId);
  assertCalendarScope();
  const calendar = await integrationService.getConfig<{ calendarId?: string }>(
    userId,
    "google_calendar",
  );
  return calendar?.calendarId?.trim() || "primary";
}

export const googleCalendarService = {
  async markEventsPaid(userId: string, entry: DueEntryRow) {
    const calendarId = await prepareCalendarEnv(userId);
    const { markCalendarEventsPaid } =
      await import("@/lib/soa/google-calendar");
    return markCalendarEventsPaid(toCalendarDueEntry(entry), calendarId);
  },

  async markEventsUnpaid(userId: string, entry: DueEntryRow) {
    const calendarId = await prepareCalendarEnv(userId);
    const { markCalendarEventsUnpaid } =
      await import("@/lib/soa/google-calendar");
    return markCalendarEventsUnpaid(toCalendarDueEntry(entry), calendarId);
  },

  async createDueDateEvents(
    userId: string,
    rows: Parameters<
      typeof import("@/lib/soa/google-calendar").createDueDateCalendarEvents
    >[0],
  ) {
    const calendarId = await prepareCalendarEnv(userId);
    const timeZone = await resolveUserTimezone(userId);
    const telegram = await integrationService.getConfig<{ webLink?: string }>(
      userId,
      "telegram",
    );
    if (telegram?.webLink) {
      process.env.TELEGRAM_WEB_LINK = telegram.webLink;
    }
    const { createDueDateCalendarEvents } =
      await import("@/lib/soa/google-calendar");
    return createDueDateCalendarEvents(rows, calendarId, {
      timeZone,
      todayYmd: todayYmdInTimezone(timeZone),
    });
  },
};
