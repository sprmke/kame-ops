// @ts-nocheck
/**
 * Full-pipeline dry run.
 *
 * Reads due-reminders-state.json (populated by any `npm run start` or
 * `poll-new-soa` run) and prints — without touching any API or state file —
 * exactly what would happen on a given day:
 *
 *   A) Google Calendar events that would be created for upcoming due dates
 *   B) Telegram + Slack reminder messages that would be sent
 *
 * Usage:
 *   npm run dry-run                          # simulate today
 *   npm run dry-run -- --as-of=2026-04-23   # simulate a specific date
 */
import { loadState, daysUntil, type DueEntry } from "./due-reminders-state";
import {
  buildDueBodyLines,
  type DueBodyInfo,
} from "./notification-body";
import { log, logBanner } from "./logger";
import { notifyConfig, remindersConfig } from "./config";

// ─── CLI ─────────────────────────────────────────────────────────────────────

function parseAsOf(argv: string[]): string {
  for (const a of argv) {
    const m = a.match(/^--as-of=(\d{4}-\d{2}-\d{2})$/);
    if (m) return m[1]!;
  }
  const now = new Date();
  const y = now.getFullYear();
  const mo = String(now.getMonth() + 1).padStart(2, "0");
  const dy = String(now.getDate()).padStart(2, "0");
  return `${y}-${mo}-${dy}`;
}

// ─── Shared helpers ───────────────────────────────────────────────────────────

function addDays(ymd: string, n: number): string {
  const [y, m, d] = ymd.split("-").map(Number);
  const dt = new Date(y!, m! - 1, d!);
  dt.setDate(dt.getDate() + n);
  return [
    dt.getFullYear(),
    String(dt.getMonth() + 1).padStart(2, "0"),
    String(dt.getDate()).padStart(2, "0"),
  ].join("-");
}

function formatYMD(ymd: string): string {
  const [y, m, d] = ymd.split("-");
  const months = [
    "Jan","Feb","Mar","Apr","May","Jun",
    "Jul","Aug","Sep","Oct","Nov","Dec",
  ];
  const mon = months[Number(m) - 1] ?? m;
  return `${mon} ${d}, ${y}`;
}

function bodyInfoFromEntry(entry: DueEntry): DueBodyInfo {
  const link = notifyConfig.telegramWebLink.trim();
  return {
    cardLabel: entry.cardDisplayLabel ?? `${entry.bankLabel} ****${entry.cardLast4}`,
    dueDate: entry.dueDate,
    minimumDue: entry.minimumDue,
    totalDue: entry.totalDue,
    interestCharges: entry.interestCharges,
    viewSoaLink: link.length > 0 ? link : undefined,
    contactLine: entry.contactLine,
  };
}

// ─── Section A: Calendar events ───────────────────────────────────────────────

type CalendarEventPreview = {
  date: string;
  summary: string;
  isToday: boolean;
  isPast: boolean;
};

function previewCalendarEvents(
  entries: DueEntry[],
  asOf: string
): CalendarEventPreview[] {
  const events: CalendarEventPreview[] = [];
  for (const entry of entries) {
    const daysAway = daysUntil(entry.dueDateYMD, asOf);
    if (daysAway < 0) continue; // past due date — would be skipped

    for (let offset = 4; offset >= 1; offset--) {
      const eventDate = addDays(entry.dueDateYMD, -offset);
      const dayLabel = offset === 1 ? "tomorrow" : `in ${offset} days`;
      const summary = `💳 ${entry.cardDisplayLabel ?? `${entry.bankLabel} ****${entry.cardLast4}`} — Pay ${dayLabel} (due ${entry.dueDate})`;
      events.push({
        date: eventDate,
        summary,
        isToday: false,
        isPast: eventDate < asOf,
      });
    }

    // D-0
    events.push({
      date: entry.dueDateYMD,
      summary: `💳 ${entry.cardDisplayLabel ?? `${entry.bankLabel} ****${entry.cardLast4}`} — PAYMENT DUE TODAY (${entry.dueDate})`,
      isToday: false,
      isPast: entry.dueDateYMD < asOf,
    });
  }

  events.sort((a, b) => a.date.localeCompare(b.date));
  return events;
}

function printCalendarSection(entries: DueEntry[], asOf: string): void {
  log.header("A · Google Calendar events");

  const upcoming = entries.filter((e) => daysUntil(e.dueDateYMD, asOf) >= 0);
  const skipped = entries.filter((e) => daysUntil(e.dueDateYMD, asOf) < 0);

  if (skipped.length > 0) {
    for (const e of skipped) {
      const label = e.cardDisplayLabel ?? `${e.bankLabel} ****${e.cardLast4}`;
      log.detail(`Skip (past due ${e.dueDate}): ${label}`);
    }
  }

  if (upcoming.length === 0) {
    log.warn("All due dates are in the past — no Calendar events would be created.");
    return;
  }

  const events = previewCalendarEvents(upcoming, asOf);
  let wouldCreate = 0;
  let wouldSkip = 0;

  for (const ev of events) {
    if (ev.isPast) {
      log.detail(`  [already past]  ${ev.date}  ${ev.summary}`);
      wouldSkip++;
    } else {
      const marker = ev.summary.includes("DUE TODAY") ? "🔴" : "🟣";
      log.info(`  ${marker} ${ev.date}  ${ev.summary}`);
      wouldCreate++;
    }
  }

  log.line("");
  log.kv("Would create", String(wouldCreate));
  log.kv("Would skip (event date already past)", String(wouldSkip));
  log.detail(
    "Note: events already existing in Google Calendar would also be skipped (deduplicated by fingerprint). This dry run does not check the Calendar API."
  );
}

// ─── Section B: Reminder messages ────────────────────────────────────────────

type Urgency = "info" | "warning" | "final" | "today";

function urgencyFor(daysAway: number): Urgency {
  if (daysAway <= 0) return "today";
  if (daysAway === 1) return "final";
  if (daysAway === 2) return "warning";
  return "info";
}

function buildTelegramMessage(entry: DueEntry, daysAway: number): string {
  const urgency = urgencyFor(daysAway);
  const header = {
    today: "🚨🚨 *PAYMENT DUE TODAY*",
    final: "🚨 *FINAL WARNING — Due TOMORROW*",
    warning: "⚠️ *Due in 2 days*",
    info: `💳 *Due in ${daysAway} days*`,
  }[urgency];

  const body = buildDueBodyLines(bodyInfoFromEntry(entry), {
    headerLine: urgency === "today" ? "Credit card payment DUE TODAY!" : undefined,
  });

  return [header, "", ...body].join("\n");
}

function buildSlackMessage(entry: DueEntry, daysAway: number): string {
  const urgency = urgencyFor(daysAway);
  const header = {
    today: ":rotating_light::rotating_light: *PAYMENT DUE TODAY*",
    final: ":rotating_light: *FINAL WARNING — Due TOMORROW*",
    warning: ":warning: *Due in 2 days*",
    info: `:credit_card: *Due in ${daysAway} days*`,
  }[urgency];

  const body = buildDueBodyLines(bodyInfoFromEntry(entry), {
    headerLine: urgency === "today" ? "Credit card payment DUE TODAY!" : undefined,
  });

  return [header, "", ...body].join("\n");
}

function printRemindersSection(entries: DueEntry[], asOf: string): void {
  log.header("B · Telegram / Slack reminders");

  const inWindow = entries.filter((e) => {
    const d = daysUntil(e.dueDateYMD, asOf);
    return d >= 0 && d <= remindersConfig.windowDays;
  });

  if (inWindow.length === 0) {
    log.info(
      `No card is in the D-${remindersConfig.windowDays}..D-0 reminder window on ${asOf}.`
    );
    log.line("");
    log.detail("Per card — next first-ping date:");
    const sorted = [...entries].sort((a, b) =>
      a.dueDateYMD.localeCompare(b.dueDateYMD)
    );
    for (const e of sorted) {
      const label = e.cardDisplayLabel ?? `${e.bankLabel} ****${e.cardLast4}`;
      const away = daysUntil(e.dueDateYMD, asOf);
      if (away < 0) {
        log.detail(`  ${label} — due ${e.dueDate} (past)`);
      } else {
        const firstPing = addDays(e.dueDateYMD, -remindersConfig.windowDays);
        const untilFirst = daysUntil(firstPing, asOf);
        const when = untilFirst === 0 ? "today" : untilFirst === 1 ? "tomorrow" : `in ${untilFirst} days`;
        log.detail(`  ${label} — due ${e.dueDate} · first ping ${formatYMD(firstPing)} (${when})`);
      }
    }
    return;
  }

  inWindow.sort((a, b) => daysUntil(a.dueDateYMD, asOf) - daysUntil(b.dueDateYMD, asOf));

  for (const entry of inWindow) {
    const daysAway = daysUntil(entry.dueDateYMD, asOf);
    const label = entry.cardDisplayLabel ?? `${entry.bankLabel} ****${entry.cardLast4}`;
    const dayLabel = daysAway === 0 ? "due TODAY" : daysAway === 1 ? "due tomorrow" : `in ${daysAway} days`;

    log.line("");
    log.info(`── ${label} — ${dayLabel} (${entry.dueDate}) ──`);

    log.line("  [Telegram]");
    for (const line of buildTelegramMessage(entry, daysAway).split("\n")) {
      log.line(`  ${line}`);
    }
    log.line("");
    log.line("  [Slack]");
    for (const line of buildSlackMessage(entry, daysAway).split("\n")) {
      log.line(`  ${line}`);
    }
  }
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  const asOf = parseAsOf(process.argv.slice(2));

  logBanner("pay-credit-cards · Full pipeline dry run", `as of ${asOf}`);

  const state = loadState();

  log.kv("Reference date", asOf);
  log.kv("Cards in state", String(state.dues.length));
  log.kv(
    "Reminder window",
    `D-${remindersConfig.windowDays} → D-0 (${remindersConfig.windowDays + 1} days)`
  );
  log.line("");

  if (state.dues.length === 0) {
    log.warn(
      "No due dates in state yet. Run `npm run start` (or `poll-new-soa`) first to populate due-reminders-state.json."
    );
    return;
  }

  printCalendarSection(state.dues, asOf);
  log.line("");
  printRemindersSection(state.dues, asOf);

  log.line("");
  log.success("Dry run complete — nothing was sent or created.");
  log.detail(
    `Re-run with a different date: npm run dry-run -- --as-of=YYYY-MM-DD`
  );
}

main().catch((e) => {
  const msg = e instanceof Error ? e.message : String(e);
  log.error(msg);
  process.exit(1);
});
