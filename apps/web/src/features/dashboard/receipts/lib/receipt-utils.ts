import {
  matchReceiptToDue,
  resolveStatementPeriodFromDue,
} from "@/lib/receipts/match-due";
import { formatSoaPeriodLabelFromKey } from "@/lib/soa/period";

export type ReceiptGroupMode = "month" | "card";

export type ReceiptAiAnalysis = {
  confidence?: number | null;
  hasAmount?: boolean;
  hasDate?: boolean;
  hasReference?: boolean;
  isCreditCardPayment?: boolean;
  paymentDate?: string;
  referenceNumber?: string;
  aiModelError?: string;
};

export type ReceiptListItem = {
  id: string;
  originalFileName: string | null;
  parsedCardLast4: string | null;
  parsedAmount: number | null;
  parsedAmountRaw: string | null;
  bankDetected: string | null;
  aiVerdict: string | null;
  aiSummary: string | null;
  aiAnalysis: ReceiptAiAnalysis | null;
  paymentStatus: string | null;
  createdAt: Date;
  dueEntryId: string | null;
  cardDisplayLabel: string | null;
  bankLabel: string | null;
  dueDateYmd: string | null;
  statementDate: string | null;
  statementPeriodKey: string | null;
  statementPeriodLabel: string | null;
  minimumDue: string | null;
  totalDue: string | null;
};

export type ReceiptGroup = {
  key: string;
  label: string;
  items: ReceiptListItem[];
};

export type ReceiptMonthDueContext = {
  id: string;
  issuerId: string;
  cardLast4: string;
  dueDateYmd: string;
  statementPeriodKey: string;
  statementPeriodLabel: string;
};

type ReceiptRevalidationRow = Pick<
  ReceiptListItem,
  | "parsedCardLast4"
  | "parsedAmountRaw"
  | "bankDetected"
  | "aiVerdict"
  | "aiSummary"
  | "aiAnalysis"
  | "paymentStatus"
> & {
  parsedAmount: string | number | null;
};

/** Merge a revalidate mutation row into list/preview shape without losing due context. */
export function mergeReceiptFromRevalidation<T extends ReceiptListItem>(
  existing: T,
  updated: ReceiptRevalidationRow,
): T {
  return {
    ...existing,
    parsedCardLast4: updated.parsedCardLast4,
    parsedAmount:
      updated.parsedAmount != null && updated.parsedAmount !== ""
        ? Number(updated.parsedAmount)
        : null,
    parsedAmountRaw: updated.parsedAmountRaw,
    bankDetected: updated.bankDetected,
    aiVerdict: updated.aiVerdict,
    aiSummary: updated.aiSummary,
    aiAnalysis: updated.aiAnalysis,
    paymentStatus: updated.paymentStatus,
  };
}

export function receiptFileUrl(receiptId: string): string {
  return `/api/receipts/file?receiptId=${encodeURIComponent(receiptId)}`;
}

export function receiptCardLabel(receipt: ReceiptListItem): string {
  if (receipt.cardDisplayLabel) return receipt.cardDisplayLabel;
  if (receipt.bankDetected && receipt.parsedCardLast4) {
    return `${receipt.bankDetected} ···· ${receipt.parsedCardLast4}`;
  }
  if (receipt.parsedCardLast4) return `···· ${receipt.parsedCardLast4}`;
  return "Unknown card";
}

export function receiptCardGroupKey(receipt: ReceiptListItem): string {
  const last4 = receipt.parsedCardLast4 ?? "unknown";
  const bank = receipt.bankDetected ?? receipt.cardDisplayLabel ?? "unknown";
  return `${bank}:${last4}`;
}

export function formatReceiptMonthLabel(date: Date): string {
  return date.toLocaleDateString("en-PH", { month: "long", year: "numeric" });
}

export function formatReceiptDate(date: Date): string {
  return date.toLocaleDateString("en-PH", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export function formatReceiptDueDate(ymd: string | null): string | null {
  if (!ymd) return null;
  const date = new Date(`${ymd}T00:00:00`);
  if (Number.isNaN(date.getTime())) return null;
  return formatReceiptDate(date);
}

function resolveReceiptMonthGroup(
  receipt: ReceiptListItem,
  dues: ReceiptMonthDueContext[],
): { key: string; label: string } {
  if (receipt.statementPeriodKey && receipt.statementPeriodLabel) {
    return {
      key: receipt.statementPeriodKey,
      label: receipt.statementPeriodLabel,
    };
  }

  const matched = matchReceiptToDue(dues, {
    dueEntryId: receipt.dueEntryId,
    parsedCardLast4: receipt.parsedCardLast4,
    dueDateYmd: receipt.dueDateYmd,
    aiAnalysis: receipt.aiAnalysis,
    createdAt: receipt.createdAt,
  });

  if (matched) {
    return resolveStatementPeriodFromDue(matched);
  }

  if (receipt.dueDateYmd) {
    const key = receipt.dueDateYmd.slice(0, 7);
    return { key, label: formatSoaPeriodLabelFromKey(key) };
  }

  const uploaded = new Date(receipt.createdAt);
  const key = `${uploaded.getFullYear()}-${String(uploaded.getMonth() + 1).padStart(2, "0")}`;
  return { key, label: formatSoaPeriodLabelFromKey(key) };
}

export function receiptGroupPaidSummary(items: ReceiptListItem[]): {
  paidCount: number;
  totalCount: number;
} {
  return {
    totalCount: items.length,
    paidCount: items.filter((item) => item.paymentStatus === "marked_paid")
      .length,
  };
}

const PAYMENT_STATUS_RANK: Record<string, number> = {
  marked_paid: 4,
  pending: 3,
  rejected: 1,
  ai_error: 0,
};

function paymentStatusRank(status: string | null | undefined): number {
  if (!status) return 2;
  return PAYMENT_STATUS_RANK[status] ?? 2;
}

/** Identity for collapsing duplicate upload attempts of the same receipt file. */
export function receiptDuplicateIdentity(receipt: ReceiptListItem): string {
  const fileName = receipt.originalFileName?.trim().toLowerCase();
  if (fileName) return `file:${fileName}`;

  const reference = receipt.aiAnalysis?.referenceNumber?.trim();
  if (reference) return `ref:${reference}`;

  const amount =
    receipt.parsedAmountRaw?.trim() ||
    (receipt.parsedAmount != null ? String(receipt.parsedAmount) : "");
  return `amount:${amount || "unknown"}`;
}

function receiptDisplaySlotKey(
  receipt: ReceiptListItem,
  dues: ReceiptMonthDueContext[],
): string {
  const cardKey = receiptCardGroupKey(receipt);
  const periodKey = resolveReceiptMonthGroup(receipt, dues).key;
  const duplicateKey = receiptDuplicateIdentity(receipt);
  return `${cardKey}|${periodKey}|${duplicateKey}`;
}

function pickPreferredReceipt(
  current: ReceiptListItem,
  candidate: ReceiptListItem,
): ReceiptListItem {
  const currentRank = paymentStatusRank(current.paymentStatus);
  const candidateRank = paymentStatusRank(candidate.paymentStatus);
  if (candidateRank !== currentRank) {
    return candidateRank > currentRank ? candidate : current;
  }

  const currentTime = new Date(current.createdAt).getTime();
  const candidateTime = new Date(candidate.createdAt).getTime();
  return candidateTime >= currentTime ? candidate : current;
}

/** Keep the latest unique receipt per card and statement period; collapse same-file retries. */
export function dedupeReceiptsForDisplay(
  items: ReceiptListItem[],
  dues: ReceiptMonthDueContext[] = [],
): ReceiptListItem[] {
  const winners = new Map<string, ReceiptListItem>();

  for (const item of items) {
    const slotKey = receiptDisplaySlotKey(item, dues);
    const existing = winners.get(slotKey);
    winners.set(
      slotKey,
      existing ? pickPreferredReceipt(existing, item) : item,
    );
  }

  return [...winners.values()].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
  );
}

export function groupReceipts(
  items: ReceiptListItem[],
  mode: ReceiptGroupMode,
  dues: ReceiptMonthDueContext[] = [],
): ReceiptGroup[] {
  const map = new Map<string, ReceiptGroup>();

  for (const item of items) {
    if (mode === "month") {
      const { key, label } = resolveReceiptMonthGroup(item, dues);
      const group = map.get(key) ?? { key, label, items: [] };
      group.items.push(item);
      map.set(key, group);
      continue;
    }

    const key = receiptCardGroupKey(item);
    const label = receiptCardLabel(item);
    const group = map.get(key) ?? { key, label, items: [] };
    group.items.push(item);
    map.set(key, group);
  }

  return [...map.values()].sort((a, b) => {
    if (mode === "month") return b.key.localeCompare(a.key);
    return a.label.localeCompare(b.label);
  });
}
