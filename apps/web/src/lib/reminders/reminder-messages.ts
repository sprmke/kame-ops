import {
  buildDueBodyLines,
  cardLabelForDueBody,
  type DueBodyInfo,
} from "@/lib/reminders/notification-body";

export type DueReminderEntry = {
  issuerId: string;
  cardLast4: string;
  bankLabel: string;
  cardDisplayLabel?: string | null;
  dueDate: string;
  dueDateYmd: string;
  minimumDue: string;
  totalDue: string;
  interestCharges?: string | null;
  contactLine?: string | null;
  fullPan?: string | null;
  source?: string;
};

type Urgency = "info" | "warning" | "final" | "today";

function urgencyFor(daysAway: number): Urgency {
  if (daysAway <= 0) return "today";
  if (daysAway === 1) return "final";
  if (daysAway === 2) return "warning";
  return "info";
}

function bodyInfoFromEntry(
  entry: DueReminderEntry,
  telegramWebLink?: string,
): DueBodyInfo {
  return {
    cardLabel: cardLabelForDueBody(
      entry.bankLabel,
      entry.cardLast4,
      entry.cardDisplayLabel,
    ),
    dueDate: entry.dueDate,
    minimumDue: entry.minimumDue,
    totalDue: entry.totalDue,
    soaMissing: entry.source === "expected",
    interestCharges: entry.interestCharges ?? undefined,
    viewSoaLink: telegramWebLink?.trim() || undefined,
    contactLine: entry.contactLine ?? undefined,
    fullPan: entry.fullPan ?? undefined,
  };
}

export function buildTelegramReminderMessage(
  entry: DueReminderEntry,
  daysAway: number,
  telegramWebLink?: string,
): string {
  if (entry.source === "expected") {
    const header =
      daysAway < 0
        ? "🚨 *OVERDUE — SOA STILL MISSING*"
        : daysAway === 0
          ? "🚨🚨 *DUE TODAY — SOA MISSING*"
          : `⚠️ *SOA missing — due in ${daysAway} day${daysAway === 1 ? "" : "s"}*`;
    return [
      header,
      "",
      ...buildDueBodyLines(bodyInfoFromEntry(entry, telegramWebLink)),
    ].join("\n");
  }
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

  const body = buildDueBodyLines(bodyInfoFromEntry(entry, telegramWebLink), {
    headerLine:
      urgency === "today" ? "Credit card payment DUE TODAY!" : undefined,
  });

  return [header, "", ...body].join("\n");
}

export function buildSlackReminderMessage(
  entry: DueReminderEntry,
  daysAway: number,
  telegramWebLink?: string,
): string {
  if (entry.source === "expected") {
    const header =
      daysAway < 0
        ? ":rotating_light: *OVERDUE — SOA STILL MISSING*"
        : daysAway === 0
          ? ":rotating_light::rotating_light: *DUE TODAY — SOA MISSING*"
          : `:warning: *SOA missing — due in ${daysAway} day${daysAway === 1 ? "" : "s"}*`;
    return [
      header,
      "",
      ...buildDueBodyLines(bodyInfoFromEntry(entry, telegramWebLink)),
    ].join("\n");
  }
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

  const body = buildDueBodyLines(bodyInfoFromEntry(entry, telegramWebLink), {
    headerLine:
      urgency === "today" ? "Credit card payment DUE TODAY!" : undefined,
  });

  return [header, "", ...body].join("\n");
}
