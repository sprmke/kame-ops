import {
  ISSUER_ACCENTS,
  issuerAccent,
  resolveCardAccent,
  type ResolvedCardAccent,
} from "@/lib/credit-cards/card-accent";
import {
  computeStatementMonthTotals,
  dueEntryKey,
} from "@/lib/soa/outstanding";
import { formatPhpAmount, parsePhpAmount } from "@/lib/utils/format-money";

export {
  ISSUER_ACCENTS,
  issuerAccent,
  resolveCardAccent,
  type ResolvedCardAccent,
};

export { dueEntryKey };

export type SoaStatement = {
  id: string;
  statementMonth: number;
  statementYear: number;
  bankLabel: string;
  issuerId: string;
  cardLast4: string;
  cardColor?: string | null;
  minimumDue: string | null;
  totalDue: string | null;
  statementDate: string | null;
  dueDate: string | null;
  dueDateYmd: string | null;
  pdfFileName: string | null;
  parseNotes: string | null;
  soaUnavailable: boolean | null;
  transactions?: {
    id: string;
    date: string | null;
    description: string;
    amount: string;
    categorySlug?: string | null;
    categoryLabel?: string | null;
    categorySource?: string | null;
  }[];
};

export type SoaPeriodKey = `${number}-${number}`;

export type SoaPeriodGroup = {
  key: SoaPeriodKey;
  month: number;
  year: number;
  label: string;
  statements: SoaStatement[];
  totalDue: number;
  totalMinimum: number;
  cardCount: number;
  nextDueYmd: string | null;
};

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

export const STATEMENT_MONTHS = MONTH_NAMES.map((label, index) => ({
  value: index + 1,
  label,
}));

export function formatStatementMonth(month: number): string {
  return MONTH_NAMES[month - 1] ?? String(month);
}

export function periodLabel(month: number, year: number): string {
  const name = MONTH_NAMES[month - 1];
  return name ? `${name} ${year}` : `${month}/${year}`;
}

export function isSoaPeriodRange(period: {
  mode: string;
  fromMonth: number;
  fromYear: number;
  toMonth: number;
  toYear: number;
}): boolean {
  if (period.mode === "range") return true;
  return (
    period.fromMonth !== period.toMonth || period.fromYear !== period.toYear
  );
}

/** Primary title — statement month for singles, full span for multi-month ranges. */
export function soaPeriodCardTitle(period: {
  mode: string;
  fromMonth: number;
  fromYear: number;
  toMonth: number;
  toYear: number;
  label: string;
}): string {
  if (isSoaPeriodRange(period)) return period.label;
  return periodLabel(period.fromMonth, period.fromYear);
}

/** Secondary line: parent range when a single-month run sits inside a multi-month period. */
export function soaPeriodCardSubtitle(period: {
  mode: string;
  fromMonth: number;
  fromYear: number;
  toMonth: number;
  toYear: number;
  withinRangeLabel?: string | null;
}): string | null {
  if (period.withinRangeLabel) return period.withinRangeLabel;
  return null;
}

export function periodKey(month: number, year: number): SoaPeriodKey {
  return `${year}-${month}`;
}

export function daysUntilDue(dueDateYmd: string | null): number | null {
  if (!dueDateYmd) return null;
  const due = new Date(`${dueDateYmd}T00:00:00`);
  if (Number.isNaN(due.getTime())) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.round((due.getTime() - today.getTime()) / 86_400_000);
}

export function dueCountdownLabel(days: number | null): string | null {
  if (days === null) return null;
  if (days < 0) return `${Math.abs(days)}d overdue`;
  if (days === 0) return "Due today";
  if (days === 1) return "Due tomorrow";
  return `${days}d left`;
}

export function groupStatementsByPeriod(
  statements: SoaStatement[],
): SoaPeriodGroup[] {
  const map = new Map<SoaPeriodKey, SoaStatement[]>();

  for (const stmt of statements) {
    const key = periodKey(stmt.statementMonth, stmt.statementYear);
    const list = map.get(key) ?? [];
    list.push(stmt);
    map.set(key, list);
  }

  return [...map.entries()]
    .map(([key, stmts]) => {
      const [yearStr, monthStr] = key.split("-");
      const year = Number(yearStr);
      const month = Number(monthStr);
      const sorted = [...stmts].sort((a, b) => {
        const da = a.dueDateYmd ?? "";
        const db = b.dueDateYmd ?? "";
        return da.localeCompare(db);
      });

      const dues = sorted
        .map((s) => s.dueDateYmd)
        .filter((d): d is string => !!d)
        .sort();

      return {
        key,
        month,
        year,
        label: periodLabel(month, year),
        statements: sorted,
        ...computeStatementMonthTotals(sorted),
        nextDueYmd: dues[0] ?? null,
      };
    })
    .sort((a, b) => b.year - a.year || b.month - a.month);
}

export function formatDisplayAmount(raw: string | null | undefined): string {
  if (!raw || raw === "—") return "—";
  const parsed = parsePhpAmount(raw);
  if (parsed > 0) return formatPhpAmount(parsed);
  return raw;
}

export type SoaListPeriodSummary = {
  statementCount: number;
  lastRunAt: Date | string | null;
  totalDue: number;
  nextDueYmd: string | null;
};

export function computeSoaListStats(periods: SoaListPeriodSummary[]) {
  if (!periods.length) return null;

  let lastRunAt: Date | null = null;
  let totalStatements = 0;

  for (const period of periods) {
    totalStatements += period.statementCount;
    if (period.lastRunAt) {
      const runAt = new Date(period.lastRunAt);
      if (!lastRunAt || runAt > lastRunAt) lastRunAt = runAt;
    }
  }

  const latestByRun = [...periods].sort((a, b) => {
    const aTime = a.lastRunAt ? new Date(a.lastRunAt).getTime() : 0;
    const bTime = b.lastRunAt ? new Date(b.lastRunAt).getTime() : 0;
    return bTime - aTime;
  })[0];

  return {
    runs: periods.length,
    statements: totalStatements,
    totalDue: latestByRun?.totalDue ?? 0,
    nextDueYmd: latestByRun?.nextDueYmd ?? null,
    lastRunAt,
  };
}
