// @ts-nocheck
import { google } from "googleapis";

import { createGoogleOAuth2Client } from "./google-oauth";
import { notifyConfig } from "./config";
import { log } from "./logger";
import { buildDueBodyLines, dueBodyInfoFromSoaRow } from "./notification-body";
import type { DueEntry } from "./due-reminders-state";
import type { SoaRow } from "./types";

const MON: Record<string, number> = {
  Jan: 0,
  Feb: 1,
  Mar: 2,
  Apr: 3,
  May: 4,
  Jun: 5,
  Jul: 6,
  Aug: 7,
  Sep: 8,
  Oct: 9,
  Nov: 10,
  Dec: 11,
};

function parseDueDate(dueDateStr: string): Date | null {
  if (!dueDateStr || dueDateStr === "—") return null;
  const m = dueDateStr.match(/^([A-Za-z]{3})\s+(\d{2}),\s+(\d{4})$/);
  if (!m) return null;
  const mon = MON[m[1]!];
  if (mon === undefined) return null;
  return new Date(Number(m[3]), mon, Number(m[2]));
}

function toYMD(d: Date): string {
  const y = d.getFullYear();
  const mo = String(d.getMonth() + 1).padStart(2, "0");
  const dy = String(d.getDate()).padStart(2, "0");
  return `${y}-${mo}-${dy}`;
}

function addDays(d: Date, n: number): Date {
  const result = new Date(d);
  result.setDate(result.getDate() + n);
  return result;
}

export async function getCalendarClient() {
  const oauth2Client = await createGoogleOAuth2Client();
  return google.calendar({ version: "v3", auth: oauth2Client });
}

/** Hidden duplicate key on the event (not shown in Calendar UI). */
const FINGERPRINT_PRIVATE_KEY = "payCcFp";

type CalendarEventSpec = {
  summary: string;
  description: string;
  date: string;
  endDate: string;
  fingerprint: string;
  /** Google Calendar colorId (https://developers.google.com/calendar/api/v3/reference/colors/get). */
  colorId?: string;
};

function collectFingerprintsFromExistingEvent(ev: {
  description?: string | null;
  extendedProperties?: {
    private?: Record<string, string | null | undefined> | null;
  } | null;
}): string[] {
  const out: string[] = [];
  const fromPrivate = ev.extendedProperties?.private?.[FINGERPRINT_PRIVATE_KEY];
  if (typeof fromPrivate === "string" && fromPrivate.startsWith("pay-cc:")) {
    out.push(fromPrivate);
  }
  const desc = ev.description ?? "";
  const legacy = desc.match(/\[pay-cc:[^\]]+\]/g);
  if (legacy) {
    for (const br of legacy) {
      out.push(br.slice(1, -1));
    }
  }
  return out;
}

function buildEventSpecs(row: SoaRow): CalendarEventSpec[] {
  if (row.soaUnavailable) return [];
  const due = parseDueDate(row.dueDate);
  if (!due) return [];

  const dueFmt = row.dueDate;
  const dueYMD = toYMD(due);
  const info = dueBodyInfoFromSoaRow(row, notifyConfig.telegramWebLink);
  const cardLabel = info.cardLabel;
  const specs: CalendarEventSpec[] = [];

  // Warning events: D-4 through D-1
  for (let daysAway = 4; daysAway >= 1; daysAway--) {
    const eventDate = addDays(due, -daysAway);
    const dateStr = toYMD(eventDate);
    const endDateStr = toYMD(addDays(eventDate, 1));
    const dayLabel = daysAway === 1 ? "tomorrow" : `in ${daysAway} days`;
    const fp = `pay-cc:${row.issuerId}:${row.cardLast4}:${dueYMD}:D-${daysAway}`;
    const body = buildDueBodyLines(info).join("\n");

    specs.push({
      summary: `💳 ${cardLabel} — Pay ${dayLabel} (due ${dueFmt})`,
      description: body,
      date: dateStr,
      endDate: endDateStr,
      fingerprint: fp,
    });
  }

  // Due date event itself — Tomato (red, colorId 11) to stand out.
  const fpDue = `pay-cc:${row.issuerId}:${row.cardLast4}:${dueYMD}:D-0`;
  const dueBody = buildDueBodyLines(info, {
    headerLine: "Credit card payment DUE TODAY!",
  }).join("\n");
  specs.push({
    summary: `💳 ${cardLabel} — PAYMENT DUE TODAY (${dueFmt})`,
    description: dueBody,
    date: dueYMD,
    endDate: toYMD(addDays(due, 1)),
    fingerprint: fpDue,
    colorId: "11", // Tomato = red
  });

  return specs;
}

export type CalendarResult = {
  created: number;
  deleted: number;
  skipped: number;
};

export type MarkPaidCalendarResult = {
  updated: number;
  skipped: number;
  error?: string;
};

export type MarkUnpaidCalendarResult = {
  updated: number;
  skipped: number;
  error?: string;
};

export async function createDueDateCalendarEvents(
  rows: SoaRow[],
  calendarId = "primary",
): Promise<CalendarResult> {
  const calendar = await getCalendarClient();
  const result: CalendarResult = { created: 0, deleted: 0, skipped: 0 };

  // Normalise today to midnight local time for a clean date comparison.
  const todayMidnight = new Date();
  todayMidnight.setHours(0, 0, 0, 0);

  const allParseable = rows.filter(
    (r) => !r.soaUnavailable && parseDueDate(r.dueDate),
  );

  // Rows whose due date is still today or in the future.
  const validRows = allParseable.filter((r) => {
    const due = parseDueDate(r.dueDate)!;
    return due >= todayMidnight;
  });

  const pastRows = allParseable.filter((r) => {
    const due = parseDueDate(r.dueDate)!;
    return due < todayMidnight;
  });

  for (const r of pastRows) {
    const label = r.cardDisplayLabel ?? `${r.bankLabel} ****${r.cardLast4}`;
    log.detail(`Skip (past due date ${r.dueDate}): ${label}`);
  }

  if (validRows.length === 0) {
    if (pastRows.length > 0) {
      log.warn("All due dates are in the past — no calendar events created.");
    } else {
      log.warn(
        "No rows with parseable due dates — nothing to add to Calendar.",
      );
    }
    return result;
  }

  // Determine the full date range to scan for existing events.
  const allDueDates = validRows.map((r) => parseDueDate(r.dueDate)!);
  const minDue = new Date(Math.min(...allDueDates.map((d) => d.getTime())));
  const maxDue = new Date(Math.max(...allDueDates.map((d) => d.getTime())));
  const scanStart = addDays(minDue, -4);
  const scanEnd = addDays(maxDue, 1);

  // Fetch existing events in that range — build a map from fingerprint → eventId
  // so we can delete stale copies before re-creating fresh ones.
  type ExistingEvent = {
    id?: string | null;
    description?: string | null;
    extendedProperties?: {
      private?: Record<string, string | null | undefined> | null;
    } | null;
  };
  let existingItems: ExistingEvent[] = [];
  try {
    const existing = await calendar.events.list({
      calendarId,
      timeMin: new Date(
        scanStart.getFullYear(),
        scanStart.getMonth(),
        scanStart.getDate(),
      ).toISOString(),
      timeMax: new Date(
        scanEnd.getFullYear(),
        scanEnd.getMonth(),
        scanEnd.getDate() + 1,
      ).toISOString(),
      maxResults: 500,
      singleEvents: true,
    });
    existingItems = existing.data.items ?? [];
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (/insufficient.?scope|forbidden|403/i.test(msg)) {
      throw new Error(
        `Google Calendar scope missing.\n` +
          `Re-run  npm run gmail-auth  to add the Calendar.Events permission to your token.`,
      );
    }
    throw e;
  }

  // Map fingerprint → Google Calendar event id for all existing pay-cc events.
  const existingByFingerprint = new Map<string, string>();
  for (const ev of existingItems) {
    if (!ev.id) continue;
    for (const fp of collectFingerprintsFromExistingEvent(ev)) {
      existingByFingerprint.set(fp, ev.id);
    }
  }

  for (const row of validRows) {
    const specs = buildEventSpecs(row);
    for (const spec of specs) {
      // Delete the existing event if one is found for this fingerprint.
      const existingId = existingByFingerprint.get(spec.fingerprint);
      if (existingId) {
        try {
          await calendar.events.delete({ calendarId, eventId: existingId });
          log.detail(`Deleted (stale): ${spec.summary}`);
          result.deleted++;
        } catch (e) {
          const msg = e instanceof Error ? e.message : String(e);
          // 410 = already deleted (e.g. user deleted it manually); safe to ignore.
          if (!/410|gone/i.test(msg)) {
            log.warn(`Could not delete existing event: ${msg}`);
          }
        }
      }

      // Always create a fresh event with the latest data.
      await calendar.events.insert({
        calendarId,
        requestBody: {
          summary: spec.summary,
          description: spec.description,
          colorId: spec.colorId,
          extendedProperties: {
            private: { [FINGERPRINT_PRIVATE_KEY]: spec.fingerprint },
          },
          start: { date: spec.date },
          end: { date: spec.endDate },
          reminders: {
            useDefault: false,
            overrides: [{ method: "popup", minutes: 480 }],
          },
        },
      });
      log.success(`Created: ${spec.summary} on ${spec.date}`);
      result.created++;
    }
  }

  return result;
}

/**
 * Update all Google Calendar events for a paid card to show "✅ PAID" in the
 * title and remove popup reminders so they stop alerting.
 *
 * Finds events whose private fingerprint (or legacy description tag) matches
 * `pay-cc:{issuerId}:{cardLast4}:{dueDateYMD}:D-*`.
 */
export async function markCalendarEventsPaid(
  entry: DueEntry,
  calendarId = "primary",
): Promise<MarkPaidCalendarResult> {
  const result: MarkPaidCalendarResult = { updated: 0, skipped: 0 };

  let calendar: Awaited<ReturnType<typeof getCalendarClient>>;
  try {
    calendar = await getCalendarClient();
  } catch (e) {
    result.error = e instanceof Error ? e.message : String(e);
    return result;
  }

  // Scan D-5 through D+1 to catch all warning + due-date events.
  const due = (() => {
    const [y, m, d] = entry.dueDateYMD.split("-").map(Number);
    return new Date(y!, m! - 1, d!);
  })();
  const scanStart = addDays(due, -5);
  const scanEnd = addDays(due, 2);

  let existingItems: {
    id?: string | null;
    summary?: string | null;
    description?: string | null;
    extendedProperties?: {
      private?: Record<string, string | null | undefined> | null;
    } | null;
  }[] = [];

  try {
    const res = await calendar.events.list({
      calendarId,
      timeMin: new Date(
        scanStart.getFullYear(),
        scanStart.getMonth(),
        scanStart.getDate(),
      ).toISOString(),
      timeMax: new Date(
        scanEnd.getFullYear(),
        scanEnd.getMonth(),
        scanEnd.getDate() + 1,
      ).toISOString(),
      maxResults: 200,
      singleEvents: true,
    });
    existingItems = res.data.items ?? [];
  } catch (e) {
    result.error = e instanceof Error ? e.message : String(e);
    return result;
  }

  const prefix = `pay-cc:${entry.issuerId}:${entry.cardLast4}:${entry.dueDateYMD}:`;
  const paidDate = new Date().toLocaleDateString("en-PH", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });
  const cardLabel =
    entry.cardDisplayLabel ?? `${entry.bankLabel} ****${entry.cardLast4}`;

  for (const ev of existingItems) {
    if (!ev.id) continue;
    const fps = collectFingerprintsFromExistingEvent(ev);
    const isOurs = fps.some((fp) => fp.startsWith(prefix));
    if (!isOurs) continue;

    const oldSummary = ev.summary ?? "";
    if (oldSummary.startsWith("✅")) {
      result.skipped++;
      continue;
    }

    const newSummary = `✅ PAID — ${cardLabel} (due ${entry.dueDate})`;
    const oldDesc = ev.description ?? "";
    const newDesc = `✅ Paid on ${paidDate}\n\n${oldDesc}`;

    try {
      await calendar.events.patch({
        calendarId,
        eventId: ev.id,
        requestBody: {
          summary: newSummary,
          description: newDesc,
          colorId: "2", // Sage (green)
          reminders: { useDefault: false, overrides: [] },
        },
      });
      log.success(`Marked paid: ${newSummary}`);
      result.updated++;
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      log.warn(`Could not update event "${oldSummary}": ${msg}`);
      result.skipped++;
    }
  }

  return result;
}

/**
 * Reverse a markCalendarEventsPaid call.
 *
 * For every Google Calendar event whose private fingerprint matches
 * `pay-cc:{issuerId}:{cardLast4}:{dueDateYMD}:D-*`:
 *  - Restores the original `💳` title (reconstructed from the fingerprint D-N
 *    value + DueEntry fields).
 *  - Strips the "✅ Paid on ..." prepended line from the description.
 *  - Restores the original colorId (Tomato/11 for D-0, calendar default for
 *    D-1..D-4).
 *  - Restores the 8-hour popup reminder.
 */
export async function markCalendarEventsUnpaid(
  entry: DueEntry,
  calendarId = "primary",
): Promise<MarkUnpaidCalendarResult> {
  const result: MarkUnpaidCalendarResult = { updated: 0, skipped: 0 };

  let calendar: Awaited<ReturnType<typeof getCalendarClient>>;
  try {
    calendar = await getCalendarClient();
  } catch (e) {
    result.error = e instanceof Error ? e.message : String(e);
    return result;
  }

  const due = (() => {
    const [y, m, d] = entry.dueDateYMD.split("-").map(Number);
    return new Date(y!, m! - 1, d!);
  })();
  const scanStart = addDays(due, -5);
  const scanEnd = addDays(due, 2);

  let existingItems: {
    id?: string | null;
    summary?: string | null;
    description?: string | null;
    extendedProperties?: {
      private?: Record<string, string | null | undefined> | null;
    } | null;
  }[] = [];

  try {
    const res = await calendar.events.list({
      calendarId,
      timeMin: new Date(
        scanStart.getFullYear(),
        scanStart.getMonth(),
        scanStart.getDate(),
      ).toISOString(),
      timeMax: new Date(
        scanEnd.getFullYear(),
        scanEnd.getMonth(),
        scanEnd.getDate() + 1,
      ).toISOString(),
      maxResults: 200,
      singleEvents: true,
    });
    existingItems = res.data.items ?? [];
  } catch (e) {
    result.error = e instanceof Error ? e.message : String(e);
    return result;
  }

  const prefix = `pay-cc:${entry.issuerId}:${entry.cardLast4}:${entry.dueDateYMD}:`;
  const cardLabel =
    entry.cardDisplayLabel ?? `${entry.bankLabel} ****${entry.cardLast4}`;
  const dueFmt = entry.dueDate;

  for (const ev of existingItems) {
    if (!ev.id) continue;
    const fps = collectFingerprintsFromExistingEvent(ev);
    const matched = fps.find((fp) => fp.startsWith(prefix));
    if (!matched) continue;

    const oldSummary = ev.summary ?? "";
    if (!oldSummary.startsWith("✅")) {
      // Already looks like an unpaid event — skip.
      result.skipped++;
      continue;
    }

    // Reconstruct original title from the D-N suffix in the fingerprint.
    const dSuffix = matched.replace(prefix, "");
    const daysAway = dSuffix.startsWith("D-") ? Number(dSuffix.slice(2)) : NaN;

    let originalSummary: string;
    let originalColorId: string | null;
    if (daysAway === 0) {
      originalSummary = `💳 ${cardLabel} — PAYMENT DUE TODAY (${dueFmt})`;
      originalColorId = "11"; // Tomato/red
    } else if (Number.isFinite(daysAway) && daysAway > 0) {
      const dayLabel = daysAway === 1 ? "tomorrow" : `in ${daysAway} days`;
      originalSummary = `💳 ${cardLabel} — Pay ${dayLabel} (due ${dueFmt})`;
      originalColorId = null; // remove custom colour → calendar default
    } else {
      originalSummary = `💳 ${cardLabel} — due ${dueFmt}`;
      originalColorId = null;
    }

    // Strip the "✅ Paid on …\n\n" block prepended by markCalendarEventsPaid.
    const oldDesc = ev.description ?? "";
    const newDesc = oldDesc.replace(/^✅ Paid on [^\n]+\n\n?/, "");

    try {
      await calendar.events.patch({
        calendarId,
        eventId: ev.id,
        requestBody: {
          summary: originalSummary,
          description: newDesc,
          colorId: originalColorId,
          reminders: {
            useDefault: false,
            overrides: [{ method: "popup", minutes: 480 }],
          },
        },
      });
      log.success(`Restored unpaid: ${originalSummary}`);
      result.updated++;
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      log.warn(`Could not restore event "${oldSummary}": ${msg}`);
      result.skipped++;
    }
  }

  return result;
}
