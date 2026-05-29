// @ts-nocheck
/**
 * Poll Gmail history for newly added messages that look like credit-card SOA emails
 * (PDF + subject heuristics). For each new message, runs the full SOA pipeline for the
 * inferred statement month/year and sends Telegram/Slack like `src/index.ts`.
 *
 * Intended for cron (e.g. every 5–15 minutes) or a small always-on worker on a VPS.
 *
 * First run: creates state with the current mailbox historyId (no backlog). Use --init
 * to reset after moving machines or if history expired (HTTP 404 on history.list).
 *
 * Gmail History only reports *new* activity after the saved cursor. After --init, mail
 * already in the inbox is invisible to History until you run with --catch-up-days=D (or
 * SOA_POLL_CATCH_UP_DAYS) or process that month via npm run start:cli.
 */
import fs from "node:fs";
import path from "node:path";
import type { gmail_v1 } from "googleapis";
import { projectPaths, calendarConfig } from "./config";
import { getGmailClient } from "./gmail";
import {
  getMailboxHistoryId,
  isGmailNotFoundError,
  listAddedMessageIdsSince,
} from "./gmail-history";
import { log, logBanner } from "./logger";
import { runSoa } from "./soa-run";
import { messageMetadataToSoaCandidate } from "./soa-message-detect";
import { createDueDateCalendarEvents } from "./google-calendar";

const DEFAULT_STATE_BASENAME = "soa-gmail-watch-state.json";
const MAX_PROCESSED_IDS = 400;
/** Cap extra ids from inbox search per poll (API + CPU). */
const MAX_CATCH_UP_MESSAGE_IDS = 100;

type WatchState = {
  historyId: string;
  /** Message ids for which we already completed a full `runSoa` (crash / retry dedupe). */
  processedSoaRunMessageIds: string[];
};

function watchStatePath(): string {
  const override = process.env.SOA_GMAIL_WATCH_STATE?.trim();
  if (override) return path.resolve(projectPaths.root, override);
  return path.join(projectPaths.dataDir, DEFAULT_STATE_BASENAME);
}

function loadState(pathStr: string): WatchState | null {
  try {
    const raw = fs.readFileSync(pathStr, "utf8");
    const j = JSON.parse(raw) as unknown;
    if (!j || typeof j !== "object") return null;
    const o = j as Record<string, unknown>;
    const historyId = o.historyId;
    const processed = o.processedSoaRunMessageIds;
    if (typeof historyId !== "string" || !historyId) return null;
    if (!Array.isArray(processed)) {
      return { historyId, processedSoaRunMessageIds: [] };
    }
    const ids = processed.filter((x): x is string => typeof x === "string");
    return { historyId, processedSoaRunMessageIds: ids };
  } catch {
    return null;
  }
}

function saveState(pathStr: string, state: WatchState): void {
  fs.mkdirSync(path.dirname(pathStr), { recursive: true });
  const trimmed: WatchState = {
    historyId: state.historyId,
    processedSoaRunMessageIds:
      state.processedSoaRunMessageIds.slice(-MAX_PROCESSED_IDS),
  };
  fs.writeFileSync(pathStr, JSON.stringify(trimmed, null, 2), "utf8");
}

function parseFlags(argv: string[]): {
  init: boolean;
  dryRun: boolean;
  catchUpDays: number;
} {
  let init = false;
  let dryRun = false;
  let catchUpDays = 0;
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!;
    if (a === "--init") init = true;
    if (a === "--dry-run") dryRun = true;
    if (a === "--catch-up-days" && argv[i + 1]) {
      const n = Number.parseInt(argv[++i]!, 10);
      if (Number.isFinite(n) && n > 0 && n <= 30) catchUpDays = n;
    } else if (a.startsWith("--catch-up-days=")) {
      const n = Number.parseInt(a.split("=")[1] ?? "", 10);
      if (Number.isFinite(n) && n > 0 && n <= 30) catchUpDays = n;
    }
  }
  return { init, dryRun, catchUpDays };
}

function catchUpDaysFromEnv(): number {
  const raw = process.env.SOA_POLL_CATCH_UP_DAYS?.trim() ?? "";
  const n = Number.parseInt(raw, 10);
  if (!Number.isFinite(n) || n <= 0 || n > 30) return 0;
  return n;
}

/**
 * Message ids from a Gmail search (not History). Picks PDF attachments in recent mail so
 * we can recover after --init or missed History deltas without scanning the whole mailbox.
 */
async function listRecentPdfMessageIds(
  gmail: gmail_v1.Gmail,
  days: number,
): Promise<string[]> {
  const q = `newer_than:${days}d has:attachment filename:pdf`;
  const out: string[] = [];
  const seen = new Set<string>();
  let pageToken: string | undefined;
  for (;;) {
    const list = await gmail.users.messages.list({
      userId: "me",
      q,
      maxResults: 50,
      pageToken,
    });
    for (const m of list.data.messages ?? []) {
      const id = m.id;
      if (!id || seen.has(id)) continue;
      seen.add(id);
      out.push(id);
      if (out.length >= MAX_CATCH_UP_MESSAGE_IDS) return out;
    }
    pageToken = list.data.nextPageToken ?? undefined;
    if (!pageToken) break;
  }
  return out;
}

function errMsg(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

async function main() {
  const flags = parseFlags(process.argv.slice(2));
  const { init, dryRun } = flags;
  const catchUpDays = flags.catchUpDays || catchUpDaysFromEnv();
  const statePath = watchStatePath();

  logBanner(
    "pay-credit-cards · Gmail new-SOA poll",
    dryRun ? "dry-run" : init ? "init" : "poll",
  );

  const gmail = await getGmailClient();
  log.success("Gmail API client ready");

  if (init) {
    const hid = await getMailboxHistoryId(gmail);
    const prev = loadState(statePath);
    const fresh: WatchState = {
      historyId: hid,
      processedSoaRunMessageIds: prev?.processedSoaRunMessageIds ?? [],
    };
    saveState(statePath, fresh);
    log.header("Initialized watch state");
    log.kv("State file", statePath);
    log.kv("historyId", hid);
    log.kv(
      "Preserved processed message ids",
      String(fresh.processedSoaRunMessageIds.length),
    );
    log.info(
      "History cursor is now: only *new* mailbox activity after this moment is reported by Gmail History.",
    );
    log.info(
      "Mail already sitting in the inbox is skipped until the next message in that thread or you run with --catch-up-days=D (see docs).",
    );
    return;
  }

  let state = loadState(statePath);
  if (!state) {
    const hid = await getMailboxHistoryId(gmail);
    state = { historyId: hid, processedSoaRunMessageIds: [] };
    saveState(statePath, state);
    log.header("First-time setup");
    log.kv("State file", statePath);
    log.kv("historyId", hid);
    log.info(
      "Created initial watch state — no backlog. Use `npm run poll-new-soa -- --init` anytime to reset the cursor.",
    );
    return;
  }

  let poll: Awaited<ReturnType<typeof listAddedMessageIdsSince>>;
  try {
    poll = await listAddedMessageIdsSince(gmail, state.historyId);
  } catch (e) {
    const expired = (e as Error & { historyExpired?: boolean }).historyExpired;
    if (expired) {
      const hid = await getMailboxHistoryId(gmail);
      saveState(statePath, {
        historyId: hid,
        processedSoaRunMessageIds: state.processedSoaRunMessageIds,
      });
      log.warn(errMsg(e));
      log.success(
        `Reset historyId to ${hid}. Next poll will continue from here.`,
      );
      return;
    }
    throw e;
  }

  const { newHistoryId, addedMessageIds } = poll;
  const startHistoryId = state.historyId;
  const processedSet = new Set(state.processedSoaRunMessageIds);

  let messageIdsToScan = [...addedMessageIds];
  if (catchUpDays > 0) {
    const extra = await listRecentPdfMessageIds(gmail, catchUpDays);
    const seen = new Set(messageIdsToScan);
    for (const id of extra) {
      if (!seen.has(id)) {
        seen.add(id);
        messageIdsToScan.push(id);
      }
    }
    log.header("Catch-up inbox search");
    log.kv("newer_than days", String(catchUpDays));
    log.kv("Extra PDF ids from search", String(extra.length));
    log.kv(
      "Total ids to scan (history + catch-up)",
      String(messageIdsToScan.length),
    );
  }

  if (messageIdsToScan.length === 0) {
    if (newHistoryId !== state.historyId && !dryRun) {
      saveState(statePath, {
        historyId: newHistoryId,
        processedSoaRunMessageIds: state.processedSoaRunMessageIds,
      });
    }
    log.header("Poll complete");
    log.kv("New messages in history", "0");
    log.detail(`historyId ${state.historyId} → ${newHistoryId}`);
    log.info(
      "Gmail History only lists messages *added* after the saved cursor. If you recently ran --init, older SOAs already in the inbox will not appear here.",
    );
    log.info(
      "Recovery: npm run poll-new-soa -- --catch-up-days=7   or   npm run start:cli   for that statement month.",
    );
    return;
  }

  if (addedMessageIds.length > 0) {
    log.header("New messages (history)");
    log.kv("Count", String(addedMessageIds.length));
  } else if (catchUpDays > 0) {
    log.header("New messages (history)");
    log.kv("Count", "0 (using catch-up search only)");
  }

  type Candidate = NonNullable<
    ReturnType<typeof messageMetadataToSoaCandidate>
  > & { internalMs: number };

  const candidates: Candidate[] = [];
  let skippedMissingMessages = 0;

  for (const id of messageIdsToScan) {
    // "full" is required so payload.parts (attachments) are included.
    // "metadata" only returns headers — partHasPdfAttachment would always return false.
    try {
      const full = await gmail.users.messages.get({
        userId: "me",
        id,
        format: "full",
      });
      const internalDate = full.data.internalDate ?? "";
      const internalMs = Number.parseInt(internalDate, 10) || 0;
      const c = messageMetadataToSoaCandidate({
        messageId: id,
        payload: full.data.payload,
        internalDate,
      });
      if (!c) continue;
      candidates.push({ ...c, internalMs });
    } catch (e) {
      // History can still list message ids that are already deleted / expunged.
      if (isGmailNotFoundError(e)) {
        skippedMissingMessages++;
        log.warn(
          `Skip message ${id.slice(0, 16)}… — ${errMsg(e)} (no longer in mailbox)`,
        );
        continue;
      }
      throw e;
    }
  }

  if (skippedMissingMessages > 0) {
    log.kv("Skipped missing messages (404)", String(skippedMissingMessages));
  }

  candidates.sort((a, b) => a.internalMs - b.internalMs);

  if (candidates.length === 0) {
    if (!dryRun) {
      saveState(statePath, {
        historyId: newHistoryId,
        processedSoaRunMessageIds: state.processedSoaRunMessageIds,
      });
    }
    log.header("Poll complete");
    log.kv("SOA candidates", "0");
    log.detail(`historyId → ${newHistoryId}`);
    return;
  }

  log.header("SOA candidates");
  for (const c of candidates) {
    log.detail(
      `${c.messageId.slice(0, 12)}… · ${c.month}/${c.year} (${c.periodSource}) · ${c.subject.slice(0, 72)}${c.subject.length > 72 ? "…" : ""}`,
    );
  }

  if (dryRun) {
    log.header("Dry-run");
    log.info("Skipped runSoa and state historyId update.");
    return;
  }

  let processed = [...state.processedSoaRunMessageIds];
  let runsThisBatch = 0;

  for (const c of candidates) {
    if (processedSet.has(c.messageId)) {
      log.info(`Skip (already processed): ${c.messageId.slice(0, 16)}…`);
      continue;
    }
    log.header(`Run SOA · ${c.month}/${c.year}`);
    log.kv("Triggered by message", c.messageId);
    log.kv("Period source", c.periodSource);
    try {
      const rows = await runSoa({
        mode: "single",
        month: c.month,
        year: c.year,
        skipNotify: false,
        skipBanner: true,
      });
      processedSet.add(c.messageId);
      processed.push(c.messageId);
      runsThisBatch++;
      saveState(statePath, {
        historyId: startHistoryId,
        processedSoaRunMessageIds: processed,
      });
      log.success(
        "runSoa finished; checkpoint saved (history cursor advances after full batch).",
      );

      if (calendarConfig.autoCreate) {
        log.header("Google Calendar · due-date events (auto)");
        try {
          const calResult = await createDueDateCalendarEvents(
            rows,
            calendarConfig.calendarId,
          );
          if (calResult.deleted > 0) {
            log.info(`Deleted ${calResult.deleted} stale event(s).`);
          }
          if (calResult.created > 0) {
            log.success(`Created ${calResult.created} event(s).`);
          }
          if (calResult.created === 0) {
            log.warn(
              "No calendar events created (no upcoming due dates found).",
            );
          }
        } catch (calErr) {
          log.error(`Calendar step failed: ${errMsg(calErr)}`);
          log.detail("SOA was still processed successfully.");
        }
      }
    } catch (e) {
      log.error(`runSoa failed: ${errMsg(e)}`);
      log.detail(
        "historyId left unchanged for this batch — fix the error and re-run; already-finished messages are skipped via processed list.",
      );
      process.exitCode = 1;
      return;
    }
  }

  saveState(statePath, {
    historyId: newHistoryId,
    processedSoaRunMessageIds: processed,
  });

  log.header("Poll complete");
  log.kv("SOA runs this batch", String(runsThisBatch));
  log.detail(`historyId ${startHistoryId} → ${newHistoryId}`);
}

const isCliEntry =
  typeof process.argv[1] === "string" &&
  process.argv[1].includes("gmail-poll-new-soa");

if (isCliEntry) {
  main().catch((e) => {
    log.error(errMsg(e));
    process.exit(1);
  });
}

export { main as pollNewSoaFromGmail };
