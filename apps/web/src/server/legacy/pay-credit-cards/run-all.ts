// @ts-nocheck
/**
 * Full-pipeline runner — no interactive prompts.
 *
 * Runs all three steps in sequence for a given statement month:
 *   1. SOA pipeline  — Gmail search → download PDFs → parse → summary PDF
 *                      → Telegram / Slack notification
 *                      → upsert due-reminders-state.json
 *   2. Google Calendar — create due-date events for every upcoming due date
 *   3. Daily reminders — send Telegram / Slack reminder pings for cards in
 *                        the D-window on the --as-of date
 *
 * Usage:
 *   npm run run-all                              # current month + today's reminders
 *   npm run run-all -- --month=4 --year=2026     # specific month
 *   npm run run-all -- --month=4 --year=2026 --as-of=2026-04-27
 *
 * Flags:
 *   --month=<N|name>     Statement month (default: current).
 *   --year=<YYYY>        Statement year  (default: current).
 *   --as-of=YYYY-MM-DD   Treat this date as "today" for the reminders step
 *                        (default: real today).
 *   --no-notify          Skip Telegram/Slack SOA summary notification.
 *   --no-calendar        Skip Google Calendar event creation.
 *   --no-reminders       Skip the daily reminders step.
 *   --force-reminders    Re-send reminders even if already sent today.
 */
import { log, logBanner } from "./logger";
import { calendarConfig } from "./config";
import { runSoa, type RunSoaOptions } from "./soa-run";
import { createDueDateCalendarEvents } from "./google-calendar";
import { runSendReminders } from "./send-reminders";
import { buildMonthContext } from "./month";

// ─── CLI parsing ──────────────────────────────────────────────────────────────

type RunAllOptions = {
  month: string;
  year: string;
  asOf: string | undefined;
  skipNotify: boolean;
  skipCalendar: boolean;
  skipReminders: boolean;
  forceReminders: boolean;
};

function todayYMD(): string {
  const now = new Date();
  return [
    now.getFullYear(),
    String(now.getMonth() + 1).padStart(2, "0"),
    String(now.getDate()).padStart(2, "0"),
  ].join("-");
}

function parseRunAllArgs(argv: string[]): RunAllOptions {
  const now = new Date();
  let month = String(now.getMonth() + 1);
  let year = String(now.getFullYear());
  let asOf: string | undefined;
  let skipNotify = false;
  let skipCalendar = false;
  let skipReminders = false;
  let forceReminders = false;

  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!;
    if (a === "--month" && argv[i + 1]) {
      month = argv[++i]!;
    } else if (a.startsWith("--month=")) {
      month = a.split("=")[1] ?? month;
    } else if (a === "--year" && argv[i + 1]) {
      year = argv[++i]!;
    } else if (a.startsWith("--year=")) {
      year = a.split("=")[1] ?? year;
    } else if (a.startsWith("--as-of=")) {
      const v = a.split("=")[1] ?? "";
      if (/^\d{4}-\d{2}-\d{2}$/.test(v)) {
        asOf = v;
      } else {
        log.warn(`Ignoring --as-of=${JSON.stringify(v)} — expected YYYY-MM-DD`);
      }
    } else if (a === "--no-notify" || a === "--no-email") {
      skipNotify = true;
    } else if (a === "--no-calendar") {
      skipCalendar = true;
    } else if (a === "--no-reminders") {
      skipReminders = true;
    } else if (a === "--force-reminders") {
      forceReminders = true;
    }
  }

  return { month, year, asOf, skipNotify, skipCalendar, skipReminders, forceReminders };
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  const opts = parseRunAllArgs(process.argv.slice(2));
  const ctx = buildMonthContext(opts.month, opts.year);
  const asOfDisplay = opts.asOf ?? todayYMD();

  logBanner(
    "pay-credit-cards · Full run",
    `${ctx.monthLong} ${ctx.year}  ·  reminders as-of ${asOfDisplay}`
  );

  log.kv("Statement period", `${ctx.monthLong} ${ctx.year}`);
  log.kv("Reminders as-of", asOfDisplay);
  log.kv("Notify (Telegram/Slack)", opts.skipNotify ? "skipped" : "enabled");
  log.kv("Google Calendar", opts.skipCalendar ? "skipped" : "enabled");
  log.kv("Daily reminders", opts.skipReminders ? "skipped" : "enabled");
  log.line("");

  // ── Step 1: SOA pipeline ──────────────────────────────────────────────────
  log.header("Step 1 · SOA pipeline");
  const soaOptions: RunSoaOptions = {
    mode: "single",
    month: opts.month,
    year: opts.year,
    skipNotify: opts.skipNotify,
    skipBanner: true,
  };

  let rows;
  try {
    rows = await runSoa(soaOptions);
    log.success(`SOA pipeline complete — ${rows.filter((r) => !r.soaUnavailable).length} card(s) parsed.`);
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    log.error(`SOA pipeline failed: ${msg}`);
    process.exit(1);
  }

  // ── Step 2: Google Calendar ───────────────────────────────────────────────
  log.line("");
  log.header("Step 2 · Google Calendar");
  if (opts.skipCalendar) {
    log.info("Skipped (--no-calendar).");
  } else {
    try {
      const cal = await createDueDateCalendarEvents(rows, calendarConfig.calendarId);
      if (cal.deleted > 0) log.info(`Deleted ${cal.deleted} stale event(s).`);
      if (cal.created > 0) log.success(`Created ${cal.created} event(s).`);
      if (cal.created === 0) {
        log.warn("No calendar events created (no upcoming due dates found).");
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      log.error(`Calendar step failed: ${msg}`);
      log.detail("Continuing to reminders step.");
    }
  }

  // ── Step 3: Daily reminders ───────────────────────────────────────────────
  log.line("");
  log.header("Step 3 · Daily reminders");
  if (opts.skipReminders) {
    log.info("Skipped (--no-reminders).");
  } else {
    try {
      await runSendReminders({
        asOf: opts.asOf,
        force: opts.forceReminders,
        skipBanner: true,
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      log.error(`Reminders step failed: ${msg}`);
    }
  }

  log.line("");
  log.success("Full run complete.");
}

main().catch((e) => {
  const msg = e instanceof Error ? e.message : String(e);
  log.error(msg);
  process.exit(1);
});
