// @ts-nocheck
/**
 * Daily due-date reminder runner.
 *
 * Reads `data/due-reminders-state.json` (populated by runSoa) and sends a
 * Telegram / Slack ping for every card whose due date is D-`windowDays`..D-0
 * away. Idempotent: each (card, dueDate, daysAway) tuple is only sent once,
 * so launchd / cron can safely fire this at 12:00 every day.
 *
 * Usage:
 *   npm run send-reminders        # send due reminders, write state
 *   npm run send-reminders -- --dry-run   # print what would be sent, skip send + skip state write
 *
 * Debug (pretend "today" is another day — only affects this script):
 *   DUE_REMINDERS_AS_OF=2026-04-23 npm run send-reminders -- --dry-run
 */
import { isNotifyConfigured, notifyConfig, remindersConfig } from "./config";
import {
  daysUntil,
  hasReminderBeenSent,
  loadState,
  markReminderSent,
  reminderFingerprint,
  saveState,
  todayYMD,
  type DueEntry,
  type DueRemindersState,
} from "./due-reminders-state";
import { log, logBanner } from "./logger";
import { sendReminderText } from "./notify";
import {
  buildDueBodyLines,
  cardLabelForDueBody,
  type DueBodyInfo,
} from "./notification-body";

type Urgency = "info" | "warning" | "final" | "today";

function urgencyFor(daysAway: number): Urgency {
  if (daysAway <= 0) return "today";
  if (daysAway === 1) return "final";
  if (daysAway === 2) return "warning";
  return "info";
}

function cardLabel(entry: DueEntry): string {
  return cardLabelForDueBody(
    entry.bankLabel,
    entry.cardLast4,
    entry.cardDisplayLabel,
  );
}

/** DueEntry → DueBodyInfo, with the Telegram web link (if configured) for "View SOA". */
function bodyInfoFromEntry(entry: DueEntry): DueBodyInfo {
  const link = notifyConfig.telegramWebLink.trim();
  return {
    cardLabel: cardLabel(entry),
    dueDate: entry.dueDate,
    minimumDue: entry.minimumDue,
    totalDue: entry.totalDue,
    interestCharges: entry.interestCharges,
    viewSoaLink: link.length > 0 ? link : undefined,
    contactLine: entry.contactLine,
    fullPan: entry.fullPan,
  };
}

/**
 * Build a Telegram Markdown message. The body block is IDENTICAL to what the
 * matching Google Calendar event's description shows, so both channels stay
 * visually consistent.
 */
function buildTelegramMessage(entry: DueEntry, daysAway: number): string {
  const urgency = urgencyFor(daysAway);

  const header = (() => {
    switch (urgency) {
      case "today":
        return "🚨🚨 *PAYMENT DUE TODAY*";
      case "final":
        return "🚨 *FINAL WARNING — Due TOMORROW*";
      case "warning":
        return "⚠️ *Due in 2 days*";
      case "info":
        return `💳 *Due in ${daysAway} days*`;
    }
  })();

  const body = buildDueBodyLines(bodyInfoFromEntry(entry), {
    headerLine:
      urgency === "today" ? "Credit card payment DUE TODAY!" : undefined,
  });

  return [header, "", ...body].join("\n");
}

/** Slack mrkdwn variant — same body lines, emoji-based urgency header. */
function buildSlackMessage(entry: DueEntry, daysAway: number): string {
  const urgency = urgencyFor(daysAway);

  const header = (() => {
    switch (urgency) {
      case "today":
        return ":rotating_light::rotating_light: *PAYMENT DUE TODAY*";
      case "final":
        return ":rotating_light: *FINAL WARNING — Due TOMORROW*";
      case "warning":
        return ":warning: *Due in 2 days*";
      case "info":
        return `:credit_card: *Due in ${daysAway} days*`;
    }
  })();

  const body = buildDueBodyLines(bodyInfoFromEntry(entry), {
    headerLine:
      urgency === "today" ? "Credit card payment DUE TODAY!" : undefined,
  });

  return [header, "", ...body].join("\n");
}

type Plan = {
  entry: DueEntry;
  daysAway: number;
  fingerprint: string;
  alreadySent: boolean;
};

function windowDaysForEntry(entry: DueEntry, defaultWindow: number): number {
  const w = entry.reminderWindowDays;
  return w != null && Number.isFinite(w)
    ? Math.max(0, Math.trunc(w))
    : defaultWindow;
}

function intervalMinutesForEntry(entry: DueEntry): number {
  const m = entry.reminderIntervalMinutes;
  return m != null && Number.isFinite(m) && m > 0 ? Math.trunc(m) : 1440;
}

function canSendReminder(
  state: DueRemindersState,
  fingerprint: string,
  intervalMinutes: number,
  force: boolean,
): boolean {
  if (force) return true;
  const last = state.sent[fingerprint];
  if (!last) return true;
  if (intervalMinutes >= 1440) return false;
  const elapsed = Date.now() - Date.parse(last);
  return elapsed >= intervalMinutes * 60 * 1000;
}

function buildPlan(
  state: DueRemindersState,
  defaultWindowDays: number,
  fromYmd: string,
): Plan[] {
  const plans: Plan[] = [];
  for (const entry of state.dues) {
    if (entry.paidAt) {
      const label =
        entry.cardDisplayLabel ?? `${entry.bankLabel} ****${entry.cardLast4}`;
      log.detail(
        `Skipping ${label} — marked as paid on ${entry.paidAt.slice(0, 10)}`,
      );
      continue;
    }
    const windowDays = windowDaysForEntry(entry, defaultWindowDays);
    const daysAway = daysUntil(entry.dueDateYMD, fromYmd);
    if (daysAway > windowDays) continue;
    if (daysAway < 0) continue;
    const fingerprint = reminderFingerprint(entry, daysAway);
    plans.push({
      entry,
      daysAway,
      fingerprint,
      alreadySent: hasReminderBeenSent(state, fingerprint),
    });
  }
  plans.sort((a, b) => a.daysAway - b.daysAway);
  return plans;
}

function ymdAddDays(ymd: string, delta: number): string {
  const [y, m, d] = ymd.split("-").map(Number);
  const dt = new Date(y!, m! - 1, d! + delta);
  const yy = dt.getFullYear();
  const mo = String(dt.getMonth() + 1).padStart(2, "0");
  const dy = String(dt.getDate()).padStart(2, "0");
  return `${yy}-${mo}-${dy}`;
}

function humanInDays(n: number): string {
  if (n === 0) return "today";
  if (n === 1) return "tomorrow";
  if (n < 0) return `${-n} day(s) ago`;
  return `in ${n} days`;
}

/** When nothing is in the D-window, explain why (avoids "is it broken?" confusion). */
function logOutsideWindowHelp(
  dues: DueEntry[],
  windowDays: number,
  fromYmd: string,
): void {
  log.line("");
  log.info(
    `No card is in the reminder window on ${fromYmd}. ` +
      `Pings only run from D-${windowDays} through D-0 (${windowDays + 1} calendar days ending on the due date).`,
  );
  log.detail("Per card — first D-" + windowDays + " reminder date:");
  const sorted = [...dues].sort((a, b) =>
    a.dueDateYMD.localeCompare(b.dueDateYMD),
  );
  for (const e of sorted) {
    const label = e.cardDisplayLabel ?? `${e.bankLabel} ****${e.cardLast4}`;
    const away = daysUntil(e.dueDateYMD, fromYmd);
    const firstPingYmd = ymdAddDays(e.dueDateYMD, -windowDays);
    const untilFirst = daysUntil(firstPingYmd, fromYmd);
    if (away < 0) {
      log.detail(
        `${label} — due ${e.dueDate} (${away}d vs ${fromYmd}) — past due; widen window or pay, then refresh state on next SOA run`,
      );
    } else if (away > windowDays) {
      log.detail(
        `${label} — due ${e.dueDate} (${away}d away); first ping ${firstPingYmd} (${humanInDays(untilFirst)})`,
      );
    }
  }
  log.line("");
  log.detail(
    "Dry-run a future day: DUE_REMINDERS_AS_OF=2026-04-23 npm run send-reminders -- --dry-run",
  );
}

function parseAsOfYmd(): string | undefined {
  const raw = process.env.DUE_REMINDERS_AS_OF?.trim();
  if (!raw) return undefined;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    log.warn(
      `Ignoring DUE_REMINDERS_AS_OF=${JSON.stringify(raw)} — expected YYYY-MM-DD`,
    );
    return undefined;
  }
  return raw;
}

export type RunRemindersOptions = {
  /** Override "today" for the reminder window calculation. YYYY-MM-DD. */
  asOf?: string;
  /** Print messages without sending or mutating state. */
  dryRun?: boolean;
  /** Re-send even if the (card, due date, day) tuple was already sent. */
  force?: boolean;
  /** Suppress the logBanner header (used when called from run-all). */
  skipBanner?: boolean;
};

export type RunRemindersResult = {
  sent: number;
  skipped: number;
  failed: number;
};

export async function runSendReminders(
  opts: RunRemindersOptions = {},
): Promise<RunRemindersResult> {
  const dryRun = opts.dryRun ?? remindersConfig.dryRun;
  const force = opts.force ?? false;

  if (!opts.skipBanner) {
    logBanner(
      "pay-credit-cards · Due reminders",
      dryRun ? "Dry run — nothing will be sent" : "Daily run",
    );
  }

  const state = loadState();
  const clockYmd = opts.asOf ?? todayYMD();
  if (opts.asOf) {
    log.warn(`Using as-of date ${opts.asOf} instead of real clock (testing).`);
  }
  log.kv("Reference date", clockYmd);
  log.kv("Cards tracked", String(state.dues.length));
  log.kv(
    "Reminder window",
    `D-${remindersConfig.windowDays} through D-0 (inclusive)`,
  );

  if (state.dues.length === 0) {
    log.warn("No due dates in state yet. Run SOA first.");
    return { sent: 0, skipped: 0, failed: 0 };
  }

  const plans = buildPlan(state, remindersConfig.windowDays, clockYmd);
  if (plans.length === 0) {
    log.info("No cards are within the reminder window. Nothing to send.");
    logOutsideWindowHelp(state.dues, remindersConfig.windowDays, clockYmd);
    return { sent: 0, skipped: 0, failed: 0 };
  }

  log.header("Planned reminders");
  for (const p of plans) {
    const label = cardLabel(p.entry);
    const status = p.alreadySent ? "already sent" : "queued";
    const dayLabel =
      p.daysAway === 0
        ? "due TODAY"
        : p.daysAway === 1
          ? "due tomorrow"
          : `in ${p.daysAway} days`;
    log.detail(`${label} — ${dayLabel} (${p.entry.dueDate}) · ${status}`);
  }

  if (!isNotifyConfigured() && !dryRun) {
    log.warn(
      "No notifier configured — skipping send. Set TELEGRAM_BOT_TOKEN + TELEGRAM_CHAT_ID and/or SLACK_WEBHOOK_URL.",
    );
    return { sent: 0, skipped: 0, failed: 0 };
  }

  let sent = 0;
  let skipped = 0;
  let failed = 0;

  log.header(dryRun ? "Dry run · messages" : "Sending reminders");

  for (const p of plans) {
    const intervalMinutes = intervalMinutesForEntry(p.entry);
    const alreadySent = !canSendReminder(
      state,
      p.fingerprint,
      intervalMinutes,
      force,
    );
    if (alreadySent) {
      skipped++;
      continue;
    }

    const tgText = buildTelegramMessage(p.entry, p.daysAway);
    const slackText = buildSlackMessage(p.entry, p.daysAway);

    if (dryRun) {
      log.line("");
      log.info(
        `Would send · ${cardLabel(p.entry)} · D-${p.daysAway} · due ${p.entry.dueDate}`,
      );
      log.line("— Telegram —");
      log.line(tgText);
      log.line("— Slack —");
      log.line(slackText);
      sent++;
      continue;
    }

    try {
      const r = await sendReminderText(tgText, slackText);
      markReminderSent(state, p.fingerprint);
      const channels = [r.telegram && "Telegram", r.slack && "Slack"]
        .filter(Boolean)
        .join(" + ");
      log.success(
        `Sent · ${cardLabel(p.entry)} · D-${p.daysAway} (${channels})`,
      );
      sent++;
    } catch (e) {
      failed++;
      const msg = e instanceof Error ? e.message : String(e);
      log.error(`Failed · ${cardLabel(p.entry)} · D-${p.daysAway}: ${msg}`);
    }
  }

  if (!dryRun) {
    const path = saveState(state);
    log.line("");
    log.kv("State saved", path);
  }

  log.header("Run summary");
  log.kv("Sent", String(sent));
  log.kv("Skipped (already sent)", String(skipped));
  log.kv("Failed", String(failed));
  log.line("");

  return { sent, skipped, failed };
}

async function main() {
  const dryRun =
    process.argv.includes("--dry-run") || process.argv.includes("-n");
  const force = process.argv.includes("--force") || process.argv.includes("-f");
  const asOf = parseAsOfYmd();

  await runSendReminders({ dryRun, force, asOf });
}

const isCliEntry =
  typeof process.argv[1] === "string" &&
  process.argv[1].includes("send-reminders");

if (isCliEntry) {
  main().catch((e) => {
    const msg = e instanceof Error ? e.message : String(e);
    log.error(msg);
    process.exit(1);
  });
}
