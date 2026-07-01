import {
  REMINDER_INTERVALS,
  type ReminderIntervalMinutes,
} from "@/lib/db/schema/credit-cards";

export const DEFAULT_REMINDER_WINDOW_DAYS = 4;

/** When reminders begin relative to the due date (replaces legacy "D-N"). */
export function formatDaysBeforeDue(
  days: number | null | undefined,
  defaultDays = DEFAULT_REMINDER_WINDOW_DAYS,
): string {
  const n = days ?? defaultDays;
  if (n === 0) return "On due date only";
  if (n === 1) return "1 day before due";
  return `${n} days before due`;
}

/** Full reminder span from first ping through due date. */
export function formatReminderWindowSpan(
  windowDays: number | null | undefined,
  defaultDays = DEFAULT_REMINDER_WINDOW_DAYS,
): string {
  const n = windowDays ?? defaultDays;
  if (n === 0) return "Due date only";
  if (n === 1) return "1 day before through due date";
  return `${n} days before through due date`;
}

export function formatReminderFrequency(intervalMinutes: number): string {
  const minutes = Number(intervalMinutes);
  return (
    REMINDER_INTERVALS.find((i) => i.value === minutes)?.label ?? "Once per day"
  );
}

export function formatReminderSummary(
  windowDays: number | null | undefined,
  intervalMinutes: ReminderIntervalMinutes | number,
  defaultWindow = DEFAULT_REMINDER_WINDOW_DAYS,
): string {
  return `${formatDaysBeforeDue(windowDays, defaultWindow)} · ${formatReminderFrequency(intervalMinutes)}`;
}

/** Plain-language countdown to due date. */
export function formatDaysUntilDue(daysAway: number): string {
  if (daysAway === 0) return "Due today";
  if (daysAway === 1) return "Due tomorrow";
  if (daysAway < 0) {
    const n = Math.abs(daysAway);
    return n === 1 ? "Past due by 1 day" : `Past due by ${n} days`;
  }
  return `Due in ${daysAway} days`;
}

export function formatReminderActiveLabel(
  daysAway: number,
  alreadySent: boolean,
): string {
  const when = formatDaysUntilDue(daysAway);
  return alreadySent
    ? `${when} — reminder already sent`
    : `${when} — scheduled`;
}

function formatYmdShort(ymd: string): string {
  const [y, m, d] = ymd.split("-").map(Number);
  if (!y || !m || !d) return ymd;
  return new Date(y, m - 1, d).toLocaleDateString("en-PH", {
    month: "short",
    day: "numeric",
  });
}

export function formatReminderStartsLabel(
  firstReminderYmd: string,
  daysUntilFirst: number,
): string {
  if (daysUntilFirst <= 0) return "Reminders active";
  const date = formatYmdShort(firstReminderYmd);
  if (daysUntilFirst === 1) return `Reminders start tomorrow (${date})`;
  return `Reminders start in ${daysUntilFirst} days (${date})`;
}

export function noRemindersTodayMessage(): string {
  return "No cards need a reminder today.";
}

export function alreadySentRemindersMessage(inWindowCount: number): string {
  const noun = inWindowCount === 1 ? "card" : "cards";
  return `${inWindowCount} ${noun} already reminded today. Use Run now on Automations to send again.`;
}

export function inWindowCountLabel(count: number): string {
  if (count === 0) return "0 due soon";
  if (count === 1) return "1 due soon";
  return `${count} due soon`;
}
