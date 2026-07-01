const MONTH_MAP: Record<string, number> = {
  january: 1,
  jan: 1,
  february: 2,
  feb: 2,
  march: 3,
  mar: 3,
  april: 4,
  apr: 4,
  may: 5,
  june: 6,
  jun: 6,
  july: 7,
  jul: 7,
  august: 8,
  aug: 8,
  september: 9,
  sep: 9,
  sept: 9,
  october: 10,
  oct: 10,
  november: 11,
  nov: 11,
  december: 12,
  dec: 12,
};

/** Parse a loose "month year" string into `YYYY-MM`. */
export function parseMonthYear(raw: string): string | null {
  const s = raw.trim().toLowerCase();

  const mWord = s.match(/^([a-z]+)\s+(\d{4})$/);
  if (mWord) {
    const mon = MONTH_MAP[mWord[1]!];
    if (!mon) return null;
    return `${mWord[2]}-${String(mon).padStart(2, "0")}`;
  }

  const mIso = s.match(/^(\d{4})-(\d{2})$/);
  if (mIso) return `${mIso[1]}-${mIso[2]}`;

  const mSlash = s.match(/^(\d{1,2})[\/\-](\d{4})$/);
  if (mSlash) return `${mSlash[2]}-${mSlash[1]!.padStart(2, "0")}`;

  return null;
}

/** Scan arbitrary text for the first month/year token. */
export function extractMonthYearLoose(raw: string): string | null {
  if (!raw) return null;
  const s = raw.trim().toLowerCase();

  const direct = parseMonthYear(s);
  if (direct) return direct;

  const mWord = s.match(/\b([a-z]{3,9})\s+(\d{4})\b/);
  if (mWord) {
    const mon = MONTH_MAP[mWord[1]!];
    if (mon) return `${mWord[2]}-${String(mon).padStart(2, "0")}`;
  }

  const mIso = s.match(/\b(\d{4})-(\d{2})\b/);
  if (mIso) return `${mIso[1]}-${mIso[2]}`;

  const mSlash = s.match(/\b(\d{1,2})[\/\-](\d{4})\b/);
  if (mSlash) {
    const mo = Number(mSlash[1]);
    if (mo >= 1 && mo <= 12) {
      return `${mSlash[2]}-${String(mo).padStart(2, "0")}`;
    }
  }

  return null;
}

/** Parse Telegram-style paid message: `xxxx - april 2026 - paid`. */
export function parsePaidMessage(
  text: string,
): { cardLast4: string; monthYM: string } | null {
  const s = text.trim().toLowerCase();
  const m = s.match(/^(\d{4})\s*[-–—]\s*(.+?)\s*[-–—]\s*paid$/);
  if (!m) return null;
  const cardLast4 = m[1]!;
  const monthYM = parseMonthYear(m[2]!.trim());
  if (!monthYM) return null;
  return { cardLast4, monthYM };
}

/** Parse Telegram-style unpaid message: `xxxx - april 2026 - unpaid`. */
export function parseUnpaidMessage(
  text: string,
): { cardLast4: string; monthYM: string } | null {
  const s = text.trim().toLowerCase();
  const m = s.match(/^(\d{4})\s*[-–—]\s*(.+?)\s*[-–—]\s*unpaid$/);
  if (!m) return null;
  const cardLast4 = m[1]!;
  const monthYM = parseMonthYear(m[2]!.trim());
  if (!monthYM) return null;
  return { cardLast4, monthYM };
}
