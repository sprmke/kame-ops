// @ts-nocheck
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
import type {
  BankDefinition,
  CardCredential,
  GmailMonthContext,
} from "./types";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(__dirname, "..");

dotenv.config({ path: path.join(projectRoot, ".env") });

function resolveDataDir(): string {
  if (process.env.DATA_DIR) {
    return path.isAbsolute(process.env.DATA_DIR)
      ? process.env.DATA_DIR
      : path.resolve(projectRoot, process.env.DATA_DIR);
  }
  return path.join(projectRoot, "data");
}

export const projectPaths = {
  root: projectRoot,
  configsDir: path.join(projectRoot, "configs"),
  credentialsJson: path.join(projectRoot, "configs", "credentials.json"),
  tokenJson: path.join(projectRoot, "configs", "token.json"),
  get dataDir() {
    return resolveDataDir();
  },
};

export function ensureDirs() {
  const dataDir = resolveDataDir();
  const downloads = path.join(dataDir, "downloads");
  const output = path.join(dataDir, "output");
  fs.mkdirSync(downloads, { recursive: true });
  fs.mkdirSync(output, { recursive: true });
  return { downloads, output };
}

export function loadCardCredentials(): CardCredential[] {
  const raw = process.env.CARDS_JSON;
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((x) => {
        const c = x as CardCredential;
        if (
          !c ||
          typeof c.issuer !== "string" ||
          typeof c.last4 !== "string" ||
          typeof c.password !== "string"
        ) {
          return null;
        }
        const card: CardCredential = {
          issuer: c.issuer,
          last4: c.last4,
          password: c.password,
        };
        if (
          typeof c.gmailMonthOffset === "number" &&
          Number.isFinite(c.gmailMonthOffset)
        ) {
          card.gmailMonthOffset = Math.trunc(c.gmailMonthOffset);
        }
        if (typeof c.label === "string" && c.label.trim()) {
          card.label = c.label.trim();
        }
        if (typeof c.fullPan === "string" && c.fullPan.trim()) {
          card.fullPan = c.fullPan.trim();
        }
        if (typeof c.contactLine === "string" && c.contactLine.trim()) {
          card.contactLine = c.contactLine.trim();
        }
        if (
          typeof c.reminderWindowDays === "number" &&
          Number.isFinite(c.reminderWindowDays)
        ) {
          card.reminderWindowDays = Math.trunc(c.reminderWindowDays);
        }
        if (
          typeof c.reminderIntervalMinutes === "number" &&
          Number.isFinite(c.reminderIntervalMinutes)
        ) {
          card.reminderIntervalMinutes = Math.trunc(c.reminderIntervalMinutes);
        }
        if (typeof c.soaSubject === "string" && c.soaSubject.trim()) {
          card.soaSubject = c.soaSubject.trim();
        }
        return card;
      })
      .filter((c): c is CardCredential => c !== null);
  } catch {
    return [];
  }
}

/**
 * dotenv v16 treats an unquoted `#` as the start of an inline comment, which
 * silently truncates Telegram Web links like `https://web.telegram.org/k/#@bot`
 * to `https://web.telegram.org/k/`. If we spot that shape, warn once so the
 * fix (wrap the value in quotes) is obvious instead of mysteriously missing
 * the bot handle.
 */
function resolveTelegramWebLink(): string {
  const raw = (process.env.TELEGRAM_WEB_LINK ?? "").trim();
  if (!raw) return "";
  const looksTruncated = /\/(k|a|z)\/?$/.test(raw);
  if (looksTruncated) {
    const hint =
      'TELEGRAM_WEB_LINK looks truncated at the "/#" fragment. ' +
      "Wrap the value in quotes in .env, e.g.:\n" +
      '  TELEGRAM_WEB_LINK="https://web.telegram.org/k/#@your_bot_username"';
    console.warn(`\x1b[33m⚠  ${hint}\x1b[0m`);
  }
  return raw;
}

/** Telegram: @BotFather → token; chat id from getUpdates after messaging the bot */
export const notifyConfig = {
  get telegramBotToken() {
    return (process.env.TELEGRAM_BOT_TOKEN ?? "").trim();
  },
  get telegramChatId() {
    return (process.env.TELEGRAM_CHAT_ID ?? "").trim();
  },
  /** Optional web link for Slack/reminder copy (quote value in .env if URL contains #). */
  get telegramWebLink() {
    return resolveTelegramWebLink();
  },
  get slackWebhookUrl() {
    return (process.env.SLACK_WEBHOOK_URL ?? "").trim();
  },
};

/** Google Calendar: target calendar for due-date reminder events. */
export const calendarConfig = {
  get calendarId() {
    return (process.env.GOOGLE_CALENDAR_ID ?? "primary").trim();
  },
  get autoCreate() {
    return /^(1|true|yes)$/i.test(
      (process.env.GOOGLE_CALENDAR_AUTO ?? "").trim(),
    );
  },
};

/**
 * Daily due-date reminder pings sent to Telegram / Slack.
 * `windowDays` = how many days before the due date reminders start (inclusive).
 *   4 means D-4, D-3, D-2, D-1, D-0 = 5 consecutive days of messages.
 */
export const remindersConfig = {
  windowDays: Math.max(
    0,
    Number(process.env.DUE_REMINDERS_WINDOW_DAYS ?? "4") || 4,
  ),
  /** Ping only Telegram / Slack whose credentials are set (same as notifyConfig). */
  dryRun:
    (process.env.DUE_REMINDERS_DRY_RUN ?? "").trim().toLowerCase() === "1" ||
    (process.env.DUE_REMINDERS_DRY_RUN ?? "").trim().toLowerCase() === "true",
};

/**
 * Mark-as-paid via receipt image sent to the Telegram bot.
 *
 * - `imagesDir`   — where downloaded receipts are persisted (grouped by YYYY-MM).
 * - `tesseractPsm`— Tesseract page-segmentation mode ("0".."13"); default "6"
 *   (SINGLE_BLOCK) works well for most banking-app screenshots.
 * - `requireTotalDue` — when true, only mark paid if amount >= Total Due.
 *   Default (false) uses the Minimum Due threshold.
 */
export const receiptConfig = {
  imagesDir: process.env.RECEIPT_IMAGES_DIR
    ? path.resolve(projectRoot, process.env.RECEIPT_IMAGES_DIR)
    : path.join(projectPaths.dataDir, "receipts"),
  tesseractPsm: (process.env.RECEIPT_TESSERACT_PSM ?? "").trim(),
  requireTotalDue: /^(1|true|yes)$/i.test(
    (process.env.RECEIPT_REQUIRE_TOTAL_DUE ?? "").trim(),
  ),
};

export function isNotifyConfigured(): boolean {
  const telegram =
    notifyConfig.telegramBotToken.length > 0 &&
    notifyConfig.telegramChatId.length > 0;
  return telegram || notifyConfig.slackWebhookUrl.length > 0;
}

export const banks: BankDefinition[] = [
  {
    id: "metrobank",
    label: "Metrobank",
    buildQuery: (ctx: GmailMonthContext) =>
      [
        'subject:"Metrobank Credit Card MSOA Statement of Account"',
        `(${ctx.monthNum2} OR "${ctx.monthLong}" OR "${ctx.monthShort}")`,
        `"${ctx.year}"`,
      ].join(" "),
  },
  {
    id: "rcbc",
    label: "RCBC",
    buildQuery: (ctx) =>
      [
        'subject:"FLEX VISA eStatement"',
        `("${ctx.monthShort} ${ctx.year}" OR "${ctx.monthLong} ${ctx.year}")`,
      ].join(" "),
  },
  {
    id: "bpi",
    label: "BPI",
    buildQuery: (ctx) =>
      [
        'subject:("BPI Credit Card Electronic Statement" OR "Electronic Statement of Account")',
        `("${ctx.monthShort} ${ctx.year}" OR "${ctx.monthLong} ${ctx.year}")`,
      ].join(" "),
  },
  {
    id: "unionbank",
    label: "Unionbank",
    buildQuery: (ctx) =>
      [
        'subject:("REWARDS VISA PLATINUM" OR "REWARDS VISA")',
        "2600",
        `("${ctx.monthLong} ${ctx.year}" OR "${ctx.monthShort} ${ctx.year}")`,
      ].join(" "),
  },
];

export function buildGmailQuery(
  bank: BankDefinition,
  ctx: GmailMonthContext,
): string {
  const core = bank.buildQuery(ctx);
  return `(${core}) after:${ctx.afterYMD} before:${ctx.beforeYMD}`;
}

/** Card-specific subject search — still scoped to the statement month window. */
export function buildGmailQueryWithSubject(
  bank: BankDefinition,
  ctx: GmailMonthContext,
  subject: string,
): string {
  const escaped = subject.trim().replace(/\\/g, "\\\\").replace(/"/g, '\\"');
  let monthPart: string;
  switch (bank.id) {
    case "metrobank":
      monthPart = `(${ctx.monthNum2} OR "${ctx.monthLong}" OR "${ctx.monthShort}") "${ctx.year}"`;
      break;
    case "unionbank":
      monthPart = `"${ctx.monthLong} ${ctx.year}" OR "${ctx.monthShort} ${ctx.year}"`;
      break;
    default:
      monthPart = `"${ctx.monthShort} ${ctx.year}" OR "${ctx.monthLong} ${ctx.year}"`;
  }
  const core = [`subject:"${escaped}"`, monthPart].join(" ");
  return `(${core}) after:${ctx.afterYMD} before:${ctx.beforeYMD}`;
}
