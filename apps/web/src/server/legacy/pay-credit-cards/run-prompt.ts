// @ts-nocheck
/**
 * Interactive run: prompts for this month or a small set of range formats.
 * Used by VS Code task and npm run start / start:interactive.
 */
import readline from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import { log, logBanner } from "./logger";
import { buildMonthContext, enumerateMonthsInclusive } from "./month";
import { runSoa, type RunSoaOptions } from "./soa-run";
import { createDueDateCalendarEvents } from "./google-calendar";
import { calendarConfig } from "./config";

const MONTH_NAMES = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
] as const;

const RANGE_HINT =
  "Enter = this month only. Range: Jan-Mar, 1-5, or Nov 2025 - Feb 2026";

/** "Nov 2025", "Mar 2026", "3/2026" */
function parseMonthYearPair(s: string): { month: string; year: string } {
  const t = s.trim().replace(/\s+/g, " ");
  const slash = t.match(/^(\d{1,2})\s*\/\s*(\d{4})$/);
  if (slash) {
    const m = Number(slash[1]);
    if (m < 1 || m > 12) throw new Error(`Invalid month in date: ${s}`);
    return { month: String(m), year: slash[2]! };
  }
  const sp = t.match(/^(.+?)\s+(\d{4})$/);
  if (sp) {
    const month = sp[1]!.trim();
    const year = sp[2]!;
    buildMonthContext(month, year);
    return { month, year };
  }
  throw new Error(
    `Expected "Mon YYYY" or "M/YYYY" (e.g. Nov 2025 or 11/2025), got: ${s}`
  );
}

function parseMonthOnly(s: string, defaultYear: string): { month: string; year: string } {
  const month = s.trim();
  buildMonthContext(month, defaultYear);
  return { month, year: defaultYear };
}

type InteractivePeriod =
  | { kind: "single"; month: string; year: string }
  | {
      kind: "rangeFromTo";
      fromMonth: string;
      fromYear: string;
      toMonth: string;
      toYear: string;
    };

function parseInteractivePeriod(
  periodRaw: string,
  yearRaw: string,
  defaults: { monthNum: number; year: string }
): InteractivePeriod {
  const period = periodRaw.trim();
  const yearFallback = yearRaw.trim() || defaults.year;

  if (!period) {
    return {
      kind: "single",
      month: String(defaults.monthNum),
      year: yearFallback,
    };
  }

  const spacedParts = period.split(/\s+[-–—]\s+/).map((x) => x.trim());
  if (spacedParts.length === 2 && spacedParts[0] && spacedParts[1]) {
    const [left, right] = spacedParts;
    const leftHasYear = /\d{4}\s*$/.test(left);
    const rightHasYear = /\d{4}\s*$/.test(right);
    if (leftHasYear && rightHasYear) {
      const a = parseMonthYearPair(left);
      const b = parseMonthYearPair(right);
      enumerateMonthsInclusive(a.month, a.year, b.month, b.year);
      return {
        kind: "rangeFromTo",
        fromMonth: a.month,
        fromYear: a.year,
        toMonth: b.month,
        toYear: b.year,
      };
    }
    if (!leftHasYear && !rightHasYear) {
      const a = parseMonthOnly(left, yearFallback);
      const b = parseMonthOnly(right, yearFallback);
      enumerateMonthsInclusive(a.month, a.year, b.month, b.year);
      return {
        kind: "rangeFromTo",
        fromMonth: a.month,
        fromYear: a.year,
        toMonth: b.month,
        toYear: b.year,
      };
    }
    throw new Error(
      `Use both months with a year on each side (e.g. Nov 2025 - Feb 2026), or neither (e.g. Jan - Mar) plus year on the next prompt. ${RANGE_HINT}`
    );
  }

  const compact = period.match(/^(\w+|\d{1,2})\s*[-–—]\s*(\w+|\d{1,2})$/);
  if (compact) {
    const a = parseMonthOnly(compact[1]!, yearFallback);
    const b = parseMonthOnly(compact[2]!, yearFallback);
    enumerateMonthsInclusive(a.month, a.year, b.month, b.year);
    return {
      kind: "rangeFromTo",
      fromMonth: a.month,
      fromYear: a.year,
      toMonth: b.month,
      toYear: b.year,
    };
  }

  // Single month name or number (e.g. "Jan", "January", "3").
  try {
    const single = parseMonthOnly(period, yearFallback);
    return { kind: "single", month: single.month, year: single.year };
  } catch {
    // Not a valid month name — fall through to error.
  }

  // Single "Mon YYYY" (e.g. "Jan 2025") with no year prompt.
  try {
    const pair = parseMonthYearPair(period);
    return { kind: "single", month: pair.month, year: pair.year };
  } catch {
    // Not a valid month+year pair.
  }

  throw new Error(RANGE_HINT);
}

function interactivePeriodToRunSoaOptions(
  p: InteractivePeriod,
  skipNotify: boolean
): RunSoaOptions {
  const base = { skipNotify, skipBanner: true as const };
  if (p.kind === "single") {
    return { mode: "single", month: p.month, year: p.year, ...base };
  }
  return {
    mode: "range",
    month: p.toMonth,
    year: p.toYear,
    fromMonth: p.fromMonth,
    fromYear: p.fromYear,
    toMonth: p.toMonth,
    toYear: p.toYear,
    ...base,
  };
}

function describePeriod(p: InteractivePeriod): string {
  if (p.kind === "single") {
    const c = buildMonthContext(p.month, p.year);
    return `${c.monthLong} ${c.year}`;
  }
  const a = buildMonthContext(p.fromMonth, p.fromYear);
  const b = buildMonthContext(p.toMonth, p.toYear);
  return `${a.monthLong} ${a.year} → ${b.monthLong} ${b.year} (inclusive)`;
}

async function main() {
  // --no-notify flag skips the prompt and always suppresses notifications.
  const forceSkipNotify =
    process.argv.includes("--no-notify") ||
    process.argv.includes("--no-email");

  const now = new Date();
  const defaultMonthNum = now.getMonth() + 1;
  const defaultMonthName = MONTH_NAMES[now.getMonth()]!;
  const defaultYear = String(now.getFullYear());

  logBanner("pay-credit-cards · SOA run", "Interactive");
  log.header("Statement period");
  log.info(RANGE_HINT);
  log.line("");

  const rl = readline.createInterface({ input, output });
  const qp = log.questionPrefix();

  const periodRaw = await rl.question(
    `${qp}Month / range [${defaultMonthName}]: `
  );
  const yearRaw = await rl.question(
    `${qp}Year (for Jan-Mar / 1-5 / Enter) [${defaultYear}]: `
  );

  let skipNotify = forceSkipNotify;
  if (!forceSkipNotify) {
    const notifyRaw = await rl.question(
      `${qp}Send notifications (Telegram / Slack)? [Y/n]: `
    );
    const ans = notifyRaw.trim().toLowerCase();
    skipNotify = ans === "n" || ans === "no";
  }

  const calRaw = await rl.question(
    `${qp}Create Google Calendar events for due dates? [y/N]: `
  );
  const createCalendarEvents =
    calRaw.trim().toLowerCase() === "y" ||
    calRaw.trim().toLowerCase() === "yes";

  rl.close();

  let parsed: InteractivePeriod;
  try {
    parsed = parseInteractivePeriod(periodRaw, yearRaw, {
      monthNum: defaultMonthNum,
      year: defaultYear,
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    throw new Error(msg.startsWith("Enter =") ? msg : `Could not parse period: ${msg}`);
  }

  const options = interactivePeriodToRunSoaOptions(parsed, skipNotify);

  log.line("");
  log.success(
    parsed.kind === "rangeFromTo"
      ? `Using range · ${describePeriod(parsed)}`
      : `Using ${describePeriod(parsed)}`
  );
  if (skipNotify) {
    log.info("Notifications: skipped");
  } else {
    log.info("Notifications: will send to Telegram / Slack");
  }
  log.info(
    createCalendarEvents
      ? "Google Calendar: will create due-date events"
      : "Google Calendar: skipped"
  );
  log.line("");

  const rows = await runSoa(options);

  if (createCalendarEvents) {
    log.header("Google Calendar · due-date events");
    try {
      const calResult = await createDueDateCalendarEvents(
        rows,
        calendarConfig.calendarId
      );
      if (calResult.deleted > 0) {
        log.info(`Deleted ${calResult.deleted} stale event(s).`);
      }
      if (calResult.created > 0) {
        log.success(`Created ${calResult.created} event(s).`);
      }
      if (calResult.created === 0) {
        log.warn("No calendar events created (no parseable due dates found).");
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      log.error(`Calendar step failed: ${msg}`);
      log.detail("SOA PDF was still saved successfully.");
    }
  }
}

main().catch((e) => {
  const msg = e instanceof Error ? e.message : String(e);
  log.error(msg);
  process.exit(1);
});
