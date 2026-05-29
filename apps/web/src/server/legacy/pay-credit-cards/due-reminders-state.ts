// @ts-nocheck
/**
 * Persistent state for daily due-date reminders.
 *
 * - `dues` stores the latest known due date per card so the daily reminder
 *   script does not need to re-parse SOAs every noon.
 * - `sent` records fingerprints of already-sent reminders to avoid duplicates
 *   if the scheduler fires twice in the same day (or we rerun the script).
 *
 * Both are upserted in-place; old entries are pruned when they go past due by
 * more than `PRUNE_GRACE_DAYS` so the file stays small.
 */
import fs from 'node:fs';
import path from 'node:path';
import { projectPaths } from './config';
import { formatInterestCharges } from './notification-body';
import type { SoaRow } from './types';

const PRUNE_GRACE_DAYS = 30;

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

export type DueEntry = {
  issuerId: string;
  cardLast4: string;
  bankLabel: string;
  cardDisplayLabel?: string;
  /** Full/masked PAN from CARDS_JSON.fullPan, e.g. "4321 XXXX XXXX 1234". */
  fullPan?: string;
  /** "Apr 25, 2026" — raw formatted date from the parsed SOA. */
  dueDate: string;
  /** "2026-04-25" — canonical ISO date for comparisons. */
  dueDateYMD: string;
  minimumDue: string;
  totalDue: string;
  /** Optional — only persisted when the SOA transactions parser found interest charges. */
  interestCharges?: string;
  /** Optional — hotline / IVR line from CARDS_JSON.contactLine. */
  contactLine?: string;
  /** ISO timestamp when this card was marked as paid via mark-paid. */
  paidAt?: string;
  /** ISO timestamp of the last time this entry was refreshed from an SOA run. */
  updatedAt: string;
};

export type DueRemindersState = {
  version: 1;
  dues: DueEntry[];
  /** Map from fingerprint → ISO timestamp when that reminder was sent. */
  sent: Record<string, string>;
};

function stateFilePath(): string {
  const override = process.env.DUE_REMINDERS_STATE;
  if (override && override.trim().length > 0) {
    return path.resolve(projectPaths.root, override.trim());
  }
  return path.join(projectPaths.dataDir, 'due-reminders-state.json');
}

function emptyState(): DueRemindersState {
  return { version: 1, dues: [], sent: {} };
}

/** Last-4 for matching: digits only, right-aligned to 4 (handles leading zeros). */
export function normalizeCardLast4(last4: string): string {
  const d = last4.replace(/\D/g, '');
  if (d.length === 0) return last4.trim();
  return d.slice(-4).padStart(4, '0');
}

function dueKey(issuerId: string, cardLast4: string): string {
  return `${issuerId.trim().toLowerCase()}:${normalizeCardLast4(cardLast4)}`;
}

/**
 * Summary PDF “Is paid” cell: compares this SOA row to `due-reminders-state.json`.
 * Uses the same `dueKey` as upserts so issuer + last4 always line up after load.
 * Returns "Yes" when a due entry for this card + due date has `paidAt`;
 * "No" when there is a matching entry for this cycle but unpaid;
 * "—" when SOA is missing, due date cannot be parsed, no due record for this
 * row, or state points at a different statement cycle (e.g. older month in a
 * range PDF).
 */
export function overviewIsPaidLabel(
  row: SoaRow,
  state: DueRemindersState,
): string {
  if (row.soaUnavailable || row.minimumDue === 'SOA not yet available') {
    return '—';
  }
  const ymd = parseDueDateToYMD(row.dueDate);
  if (!ymd) return '—';

  const rowKey = dueKey(row.issuerId, row.cardLast4);
  const rowIss = row.issuerId.trim().toLowerCase();

  const sameCardAndDue = (d: DueEntry) =>
    dueKey(d.issuerId, d.cardLast4) === rowKey && d.dueDateYMD.trim() === ymd;

  const strict = state.dues.find(sameCardAndDue);
  if (strict) return strict.paidAt ? 'Yes' : 'No';

  const sameLast4AndDue = (d: DueEntry) =>
    normalizeCardLast4(d.cardLast4) === normalizeCardLast4(row.cardLast4) &&
    d.dueDateYMD.trim() === ymd;

  const byLastAndDue = state.dues.filter(sameLast4AndDue);
  if (byLastAndDue.length === 1) {
    const e = byLastAndDue[0]!;
    return e.paidAt ? 'Yes' : 'No';
  }
  if (byLastAndDue.length > 1) {
    const iss = byLastAndDue.filter(
      (d) => (d.issuerId ?? '').trim().toLowerCase() === rowIss,
    );
    if (iss.length === 1) return iss[0]!.paidAt ? 'Yes' : 'No';
    return '—';
  }

  return '—';
}

export function parseDueDateToYMD(dueDateStr: string): string | null {
  if (!dueDateStr || dueDateStr === '—') return null;
  const m = dueDateStr.match(/^([A-Za-z]{3})\s+(\d{1,2}),\s+(\d{4})$/);
  if (!m) return null;
  const mon = MON[m[1]!];
  if (mon === undefined) return null;
  const y = Number(m[3]);
  const d = Number(m[2]);
  const mo = String(mon + 1).padStart(2, '0');
  const dy = String(d).padStart(2, '0');
  return `${y}-${mo}-${dy}`;
}

/** Align JSON dues with upsert/PDF keys (issuer lowercased, last4 normalized). */
function migrateDueOnLoad(raw: DueEntry): DueEntry {
  const ext = raw as DueEntry & { paid_at?: string };
  const paidAt = ext.paidAt ?? ext.paid_at;
  return {
    issuerId: (raw.issuerId ?? '').trim().toLowerCase(),
    cardLast4: normalizeCardLast4(String(raw.cardLast4 ?? '')),
    bankLabel: raw.bankLabel,
    cardDisplayLabel: raw.cardDisplayLabel,
    fullPan: raw.fullPan,
    dueDate: raw.dueDate,
    dueDateYMD: (raw.dueDateYMD ?? '').trim(),
    minimumDue: raw.minimumDue,
    totalDue: raw.totalDue,
    interestCharges: raw.interestCharges,
    contactLine: raw.contactLine,
    updatedAt: raw.updatedAt,
    ...(paidAt ? { paidAt: String(paidAt) } : {}),
  };
}

export function loadState(): DueRemindersState {
  const p = stateFilePath();
  if (!fs.existsSync(p)) return emptyState();
  try {
    const raw = fs.readFileSync(p, 'utf8');
    const parsed = JSON.parse(raw) as Partial<DueRemindersState>;
    const rawDues = Array.isArray(parsed.dues) ? parsed.dues : [];
    return {
      version: 1,
      dues: rawDues.map((d) => migrateDueOnLoad(d as DueEntry)),
      sent: parsed.sent && typeof parsed.sent === 'object' ? parsed.sent : {},
    };
  } catch {
    return emptyState();
  }
}

export function saveState(state: DueRemindersState): string {
  const p = stateFilePath();
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, JSON.stringify(state, null, 2) + '\n', 'utf8');
  return p;
}

/** Local calendar date `YYYY-MM-DD` (used as "today" for reminder math). */
export function todayYMD(): string {
  const now = new Date();
  const y = now.getFullYear();
  const mo = String(now.getMonth() + 1).padStart(2, '0');
  const dy = String(now.getDate()).padStart(2, '0');
  return `${y}-${mo}-${dy}`;
}

function ymdToDate(ymd: string): Date {
  const [y, m, d] = ymd.split('-').map(Number);
  return new Date(y!, m! - 1, d!);
}

/** Positive = due in the future, 0 = today, negative = past. */
export function daysUntil(ymd: string, from: string = todayYMD()): number {
  const MS = 24 * 60 * 60 * 1000;
  const a = ymdToDate(ymd).getTime();
  const b = ymdToDate(from).getTime();
  return Math.round((a - b) / MS);
}

function pruneOldEntries(state: DueRemindersState): DueRemindersState {
  const today = todayYMD();
  state.dues = state.dues.filter(
    (d) => daysUntil(d.dueDateYMD, today) >= -PRUNE_GRACE_DAYS,
  );
  const keepCutoffMs = Date.now() - PRUNE_GRACE_DAYS * 2 * 24 * 60 * 60 * 1000;
  for (const [fp, ts] of Object.entries(state.sent)) {
    const t = Date.parse(ts);
    if (Number.isFinite(t) && t < keepCutoffMs) {
      delete state.sent[fp];
    }
  }
  return state;
}

export type UpsertResult = {
  added: number;
  updated: number;
  skipped: number;
  path: string;
};

/**
 * Persist due dates from a completed SOA run. For each card, keeps the row
 * with the latest due date (so range runs don't overwrite a newer month with
 * an older one).
 */
export function upsertDuesFromSoaRows(rows: SoaRow[]): UpsertResult {
  const state = loadState();
  const byKey = new Map<string, DueEntry>();
  for (const d of state.dues) byKey.set(dueKey(d.issuerId, d.cardLast4), d);

  let added = 0;
  let updated = 0;
  let skipped = 0;
  const nowIso = new Date().toISOString();

  for (const r of rows) {
    if (r.soaUnavailable) {
      skipped++;
      continue;
    }
    const ymd = parseDueDateToYMD(r.dueDate);
    if (!ymd) {
      skipped++;
      continue;
    }
    const entry: DueEntry = {
      issuerId: r.issuerId.trim().toLowerCase(),
      cardLast4: normalizeCardLast4(r.cardLast4),
      bankLabel: r.bankLabel,
      cardDisplayLabel: r.cardDisplayLabel,
      fullPan: r.fullPan?.trim() ? r.fullPan.trim() : undefined,
      dueDate: r.dueDate,
      dueDateYMD: ymd,
      minimumDue: r.minimumDue,
      totalDue: r.totalDue,
      interestCharges: formatInterestCharges(r.transactions),
      contactLine: r.contactLine?.trim() ? r.contactLine.trim() : undefined,
      updatedAt: nowIso,
    };
    const key = dueKey(r.issuerId, r.cardLast4);
    const existing = byKey.get(key);
    if (!existing) {
      byKey.set(key, entry);
      added++;
      continue;
    }
    // Keep the latest due date; if equal, refresh amount fields + timestamp.
    if (ymd > existing.dueDateYMD) {
      byKey.set(key, entry);
      updated++;
    } else if (ymd === existing.dueDateYMD) {
      byKey.set(key, {
        ...entry,
        ...(existing.paidAt ? { paidAt: existing.paidAt } : {}),
      });
      updated++;
    } else {
      skipped++;
    }
  }

  state.dues = Array.from(byKey.values()).sort((a, b) =>
    a.dueDateYMD.localeCompare(b.dueDateYMD),
  );
  pruneOldEntries(state);
  const p = saveState(state);
  return { added, updated, skipped, path: p };
}

export function reminderFingerprint(entry: DueEntry, daysAway: number): string {
  return `reminder:${entry.issuerId}:${entry.cardLast4}:${entry.dueDateYMD}:D-${daysAway}`;
}

export function markReminderSent(
  state: DueRemindersState,
  fingerprint: string,
): void {
  state.sent[fingerprint] = new Date().toISOString();
}

export function hasReminderBeenSent(
  state: DueRemindersState,
  fingerprint: string,
): boolean {
  return Boolean(state.sent[fingerprint]);
}

/**
 * Mark a DueEntry as paid and suppress all its reminder fingerprints
 * (D-0 through D-maxWindow) so the daily send-reminders job skips them.
 * Returns the number of fingerprints that were newly suppressed.
 */
export function markDueEntryAsPaid(
  entry: DueEntry,
  maxWindowDays = 10,
): number {
  const state = loadState();
  const nowIso = new Date().toISOString();

  // Set paidAt on the entry in state (same keying as upsert + PDF Is paid).
  const idx = state.dues.findIndex(
    (d) =>
      dueKey(d.issuerId, d.cardLast4) ===
        dueKey(entry.issuerId, entry.cardLast4) &&
      d.dueDateYMD.trim() === entry.dueDateYMD.trim(),
  );
  if (idx >= 0) {
    state.dues[idx] = { ...state.dues[idx]!, paidAt: nowIso };
  }

  // Suppress all reminder fingerprints for this due date.
  let suppressed = 0;
  for (let d = 0; d <= maxWindowDays; d++) {
    const fp = reminderFingerprint(entry, d);
    if (!state.sent[fp]) {
      state.sent[fp] = nowIso;
      suppressed++;
    }
  }

  saveState(state);
  return suppressed;
}

/**
 * Reverse a mark-as-paid: remove `paidAt` from the DueEntry and delete all
 * suppressed reminder fingerprints (D-0 through D-maxWindow) so the daily
 * `send-reminders` job resumes pinging.
 *
 * Returns the number of fingerprints that were removed from `state.sent`.
 */
export function markDueEntryAsUnpaid(
  entry: DueEntry,
  maxWindowDays = 10,
): number {
  const state = loadState();

  // Remove paidAt from the entry.
  const idx = state.dues.findIndex(
    (d) =>
      dueKey(d.issuerId, d.cardLast4) ===
        dueKey(entry.issuerId, entry.cardLast4) &&
      d.dueDateYMD.trim() === entry.dueDateYMD.trim(),
  );
  if (idx >= 0) {
    const { paidAt: _, ...rest } = state.dues[idx]!;
    void _;
    state.dues[idx] = rest as DueEntry;
  }

  // Delete all reminder fingerprints for this due date so they re-fire.
  let removed = 0;
  for (let d = 0; d <= maxWindowDays; d++) {
    const fp = reminderFingerprint(entry, d);
    if (state.sent[fp]) {
      delete state.sent[fp];
      removed++;
    }
  }

  saveState(state);
  return removed;
}

/**
 * Find a DueEntry matching cardLast4 and due-date month/year (YYYY-MM).
 * Returns null if not found, or an array if multiple cards match the same last4
 * (ambiguous — caller should ask for clarification).
 */
export function findDueEntryByCardAndMonth(
  cardLast4: string,
  monthYM: string,
): DueEntry | DueEntry[] | null {
  const state = loadState();
  const lastNorm = normalizeCardLast4(cardLast4);
  const matches = state.dues.filter(
    (d) =>
      normalizeCardLast4(d.cardLast4) === lastNorm &&
      d.dueDateYMD.startsWith(monthYM),
  );
  if (matches.length === 0) return null;
  if (matches.length === 1) return matches[0]!;
  return matches;
}

/**
 * Find the most relevant unpaid DueEntry for a card last-4. "Most relevant"
 * means the entry whose due date is closest to today (absolute value), so
 * both slightly past due and soon-upcoming statements are candidates.
 *
 * Returns:
 *   - null when no entry exists at all for that last-4
 *   - "already_paid" when entries exist but all are already marked paid
 *   - DueEntry when exactly one card owns that last-4 (and it is unpaid)
 *   - DueEntry[] when multiple cards share the last-4 (caller disambiguates)
 */
export function findNearestUnpaidByLast4(
  cardLast4: string,
): DueEntry | DueEntry[] | null | 'already_paid' {
  const state = loadState();
  const lastNorm = normalizeCardLast4(cardLast4);
  const all = state.dues.filter(
    (d) => normalizeCardLast4(d.cardLast4) === lastNorm,
  );
  if (all.length === 0) return null;

  const unpaid = all.filter((d) => !d.paidAt);
  if (unpaid.length === 0) return 'already_paid';

  const today = todayYMD();
  const byIssuer = new Map<string, DueEntry>();
  for (const d of unpaid) {
    const existing = byIssuer.get(d.issuerId);
    if (!existing) {
      byIssuer.set(d.issuerId, d);
      continue;
    }
    const curDist = Math.abs(daysUntil(d.dueDateYMD, today));
    const prevDist = Math.abs(daysUntil(existing.dueDateYMD, today));
    if (curDist < prevDist) byIssuer.set(d.issuerId, d);
  }

  const picks = Array.from(byIssuer.values());
  if (picks.length === 1) return picks[0]!;
  return picks;
}
