export type TransactionKind =
  | "credit"
  | "payment"
  | "interest"
  | "fee"
  | "purchase";

import {
  CANNOT_ANALYZE_SLUG,
  type TransactionCategorySlug,
} from "@/lib/transactions/categories";

export type SoaTransaction = {
  id: string;
  date: string | null;
  description: string;
  amount: string;
  categorySlug?: TransactionCategorySlug | string | null;
  categoryLabel?: string | null;
  categorySource?: string | null;
};

export function isCreditAmount(amount: string): boolean {
  return /\(CR\)/i.test(amount) || amount.trim().startsWith("-");
}

export function parseTransactionAmount(raw: string): number {
  const n = Number.parseFloat(
    raw
      .replace(/\(CR\)/gi, "")
      .replace(/,/g, "")
      .replace(/^-/, "")
      .trim(),
  );
  return Number.isFinite(n) ? n : 0;
}

export function classifyTransaction(
  description: string,
  amount: string,
): TransactionKind {
  if (isCreditAmount(amount)) {
    if (/payment|paid|thank you|autopay|auto-pay/i.test(description)) {
      return "payment";
    }
    return "credit";
  }
  if (/interest\s+charge/i.test(description)) return "interest";
  if (
    /\b(fee|annual fee|late charge|finance charge|service charge|overlimit)\b/i.test(
      description,
    )
  ) {
    return "fee";
  }
  if (/payment|paid/i.test(description)) return "payment";
  return "purchase";
}

export const TRANSACTION_KIND_META: Record<
  TransactionKind,
  { row: string; amount: string; badge: string; label: string | null }
> = {
  credit: {
    row: "bg-[hsl(var(--success)/0.07)]",
    amount: "text-[hsl(var(--success))]",
    badge:
      "bg-[hsl(var(--success)/0.12)] text-[hsl(var(--success))] border-[hsl(var(--success)/0.25)]",
    label: "Credit",
  },
  payment: {
    row: "bg-[hsl(var(--warning)/0.14)]",
    amount: "text-[hsl(var(--warning))] font-medium",
    badge:
      "bg-[hsl(var(--warning)/0.2)] text-[hsl(var(--warning))] border-[hsl(var(--warning)/0.35)]",
    label: "Payment",
  },
  interest: {
    row: "bg-[hsl(var(--destructive)/0.07)]",
    amount: "text-[hsl(var(--destructive))] font-semibold",
    badge:
      "bg-[hsl(var(--destructive)/0.12)] text-[hsl(var(--destructive))] border-[hsl(var(--destructive)/0.25)]",
    label: "Interest",
  },
  fee: {
    row: "bg-[hsl(var(--warning)/0.09)]",
    amount: "text-[hsl(var(--warning))]",
    badge:
      "bg-[hsl(var(--warning)/0.14)] text-[hsl(var(--warning))] border-[hsl(var(--warning)/0.3)]",
    label: "Fee",
  },
  purchase: {
    row: "",
    amount: "text-foreground",
    badge: "",
    label: null,
  },
};

export function formatTransactionAmountDisplay(amount: string): string {
  const isCredit = isCreditAmount(amount);
  const value = parseTransactionAmount(amount);
  const formatted = value.toLocaleString("en-PH", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return isCredit ? `−${formatted}` : formatted;
}

export function sumTransactionsByKind(
  transactions: SoaTransaction[],
  kinds: TransactionKind[],
): number {
  return transactions.reduce((sum, t) => {
    const kind = classifyTransaction(t.description, t.amount);
    if (!kinds.includes(kind)) return sum;
    return sum + parseTransactionAmount(t.amount);
  }, 0);
}

export function groupTransactionsByDate(
  transactions: SoaTransaction[],
): { date: string; items: SoaTransaction[] }[] {
  const map = new Map<string, SoaTransaction[]>();

  for (const tx of transactions) {
    const key = tx.date?.trim() || "Undated";
    const list = map.get(key) ?? [];
    list.push(tx);
    map.set(key, list);
  }

  return [...map.entries()].map(([date, items]) => ({ date, items }));
}

export type ParsedTransactionDate = {
  posted: string | null;
  transacted: string | null;
};

const MONTH_SHORT = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec",
] as const;

/** Split pair delimiter: `04/24/26 / 05/22/26` — not every `/`. */
const DATE_PAIR_SPLIT = /\s+\/\s+/;

function monthIndexFromName(word: string): number | null {
  const t = word.toLowerCase().replace(/[^a-z]/g, "");
  if (t.length < 3) return null;
  const p3 = t.slice(0, 3);
  const idx = [
    "jan",
    "feb",
    "mar",
    "apr",
    "may",
    "jun",
    "jul",
    "aug",
    "sep",
    "oct",
    "nov",
    "dec",
  ].indexOf(p3);
  return idx >= 0 ? idx + 1 : null;
}

function formatMonthDay(month: number, day: number, year?: number): string {
  const label = MONTH_SHORT[month - 1];
  if (!label) return `${month}/${day}`;
  if (year === undefined) return `${label} ${day}`;
  const yy = year < 100 ? `'${String(year).padStart(2, "0")}` : `, ${year}`;
  return `${label} ${day}${yy}`;
}

type SlashDateOrder = "mdy" | "dmy" | "md";

function slashOrderForIssuer(issuerId?: string | null): SlashDateOrder | null {
  if (issuerId === "metrobank") return "md";
  if (issuerId === "rcbc" || issuerId === "unionbank") return "dmy";
  return null;
}

function inferSlashOrder(a: number, b: number, parts: number): SlashDateOrder {
  if (parts === 3) {
    if (a > 12) return "dmy";
    if (b > 12) return "mdy";
    return "dmy";
  }
  if (a > 12) return "dmy";
  if (b > 12) return "mdy";
  return "md";
}

function formatSlashDate(segments: number[], issuerId?: string | null): string {
  const order =
    slashOrderForIssuer(issuerId) ??
    inferSlashOrder(segments[0] ?? 0, segments[1] ?? 0, segments.length);

  if (segments.length === 3) {
    if (order === "dmy") {
      const [day, month, year] = segments;
      return formatMonthDay(month!, day!, year);
    }
    const [month, day, year] = segments;
    return formatMonthDay(month!, day!, year);
  }

  if (segments.length === 2) {
    if (order === "dmy") {
      const [day, month] = segments;
      return formatMonthDay(month!, day!);
    }
    const [month, day] = segments;
    return formatMonthDay(month!, day!);
  }

  return segments.join("/");
}

/** Format one date token from legacy parsers (Metrobank, RCBC, Unionbank, BPI). */
export function formatTransactionDatePart(
  part: string,
  issuerId?: string | null,
): string {
  const trimmed = part.trim();
  if (!trimmed) return "—";

  const monthName = trimmed.match(/^([A-Za-z]{3,12})\s+(\d{1,2})$/);
  if (monthName) {
    const month = monthIndexFromName(monthName[1]!);
    const day = Number.parseInt(monthName[2]!, 10);
    if (month && Number.isFinite(day)) return formatMonthDay(month, day);
  }

  if (trimmed.includes("/")) {
    const segments = trimmed
      .split("/")
      .map((s) => Number.parseInt(s.trim(), 10))
      .filter((n) => Number.isFinite(n));
    if (segments.length >= 2) return formatSlashDate(segments, issuerId);
  }

  return trimmed;
}

/** Split `post / trans` date pairs and format for display. */
export function parseTransactionDate(
  raw: string | null | undefined,
  issuerId?: string | null,
): ParsedTransactionDate {
  if (!raw?.trim()) return { posted: null, transacted: null };

  const parts = raw
    .split(DATE_PAIR_SPLIT)
    .map((p) => p.trim())
    .filter(Boolean);
  if (parts.length >= 2) {
    return {
      posted: formatTransactionDatePart(parts[0]!, issuerId),
      transacted: formatTransactionDatePart(parts[1]!, issuerId),
    };
  }

  return {
    posted: formatTransactionDatePart(parts[0]!, issuerId),
    transacted: null,
  };
}

export function transactionHasDualDates(
  transactions: SoaTransaction[],
): boolean {
  return transactions.some((tx) => DATE_PAIR_SPLIT.test(tx.date ?? ""));
}

/** Drop leading `(MM/DD)` from description when dates are shown in their own columns. */
export function cleanTransactionDescription(description: string): string {
  return description.replace(/^\(\d{1,2}\/\d{1,2}\)\s*/, "").trim();
}
