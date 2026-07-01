import { formatBankIssuer } from "@/lib/db/schema/credit-cards";

export type ReminderGroupMode = "month" | "card";

export type DueEntryListItem = {
  id: string;
  issuerId: string;
  bankLabel: string;
  cardLast4: string;
  cardDisplayLabel: string | null;
  dueDate: string;
  dueDateYmd: string;
  statementPeriodKey: string;
  statementPeriodLabel: string;
  minimumDue: string;
  totalDue: string;
  paidAt: Date | null;
};

export type ReminderEntryGroup = {
  key: string;
  label: string;
  items: DueEntryListItem[];
};

export function dueCardLabel(entry: DueEntryListItem): string {
  return entry.cardDisplayLabel ?? `${entry.bankLabel} ···· ${entry.cardLast4}`;
}

function monthNameFromYmd(ymd: string | null | undefined): string | null {
  if (!ymd) return null;
  const date = new Date(`${ymd}T00:00:00`);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleDateString("en-PH", { month: "long" });
}

function resolveDueBankName(entry: DueEntryListItem): string {
  const fromIssuer = formatBankIssuer(entry.issuerId);
  if (fromIssuer !== entry.issuerId) return fromIssuer;

  if (entry.bankLabel && entry.bankLabel !== entry.cardDisplayLabel) {
    return entry.bankLabel;
  }
  if (entry.cardDisplayLabel) {
    return entry.cardDisplayLabel.split(/\s+/)[0] ?? entry.cardDisplayLabel;
  }
  return "Card";
}

function resolveDueMonth(entry: DueEntryListItem): string {
  const fromPeriod = entry.statementPeriodLabel.split(" ")[0];
  if (fromPeriod) return fromPeriod;

  const fromDue = monthNameFromYmd(entry.dueDateYmd);
  if (fromDue) return fromDue;

  return new Date().toLocaleDateString("en-PH", { month: "long" });
}

/** Matches receipt card title pattern: `{name} - {last4} - {month}` */
export function formatDueCardTitle(entry: DueEntryListItem): string {
  const last4 = entry.cardLast4 || "????";
  const month = resolveDueMonth(entry);
  const name = entry.cardDisplayLabel?.trim() || resolveDueBankName(entry);
  return `${name} - ${last4} - ${month}`;
}

export function dueCardGroupKey(entry: DueEntryListItem): string {
  return `${entry.issuerId}:${entry.cardLast4}`;
}

function sortDueEntries(items: DueEntryListItem[]): DueEntryListItem[] {
  return [...items].sort((a, b) => {
    if (Boolean(a.paidAt) !== Boolean(b.paidAt)) {
      return a.paidAt ? 1 : -1;
    }
    return a.dueDateYmd.localeCompare(b.dueDateYmd);
  });
}

export function groupDueEntries(
  items: DueEntryListItem[],
  mode: ReminderGroupMode,
): ReminderEntryGroup[] {
  const map = new Map<string, ReminderEntryGroup>();

  for (const item of items) {
    if (mode === "month") {
      const key = item.statementPeriodKey;
      const label = item.statementPeriodLabel;
      const group = map.get(key) ?? { key, label, items: [] };
      group.items.push(item);
      map.set(key, group);
      continue;
    }

    const key = dueCardGroupKey(item);
    const label = dueCardLabel(item);
    const group = map.get(key) ?? { key, label, items: [] };
    group.items.push(item);
    map.set(key, group);
  }

  return [...map.values()]
    .map((group) => ({
      ...group,
      items: sortDueEntries(group.items),
    }))
    .sort((a, b) => {
      if (mode === "month") return b.key.localeCompare(a.key);
      return a.label.localeCompare(b.label);
    });
}
