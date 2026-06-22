import {
  formatDaysUntilDue,
  formatReminderActiveLabel,
  formatReminderStartsLabel,
} from "@/lib/reminders/reminder-labels";

export function daysUntilYmd(dueDateYmd: string, fromYmd: string): number {
  const MS = 86_400_000;
  const parse = (ymd: string) => {
    const [y, m, d] = ymd.split("-").map(Number);
    return new Date(y!, m! - 1, d!).getTime();
  };
  return Math.round((parse(dueDateYmd) - parse(fromYmd)) / MS);
}

export function ymdAddDays(ymd: string, delta: number): string {
  const [y, m, d] = ymd.split("-").map(Number);
  const dt = new Date(y!, m! - 1, d! + delta);
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}-${String(dt.getDate()).padStart(2, "0")}`;
}

export function todayYmdLocal(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

export type ReminderCardStatus = {
  dueEntryId: string;
  label: string;
  cardLast4: string;
  dueDate: string;
  dueDateYmd: string;
  daysAway: number;
  windowDays: number;
  inWindow: boolean;
  paid: boolean;
  firstReminderYmd: string;
  daysUntilFirstReminder: number;
  status:
    | "paid"
    | "outside_window"
    | "in_window_ready"
    | "in_window_already_sent";
  statusLabel: string;
};

export function buildReminderCardStatus(input: {
  dueEntryId: string;
  bankLabel: string;
  cardLast4: string;
  cardDisplayLabel?: string | null;
  dueDate: string;
  dueDateYmd: string;
  paidAt: Date | null;
  windowDays: number;
  asOfYmd?: string;
  alreadySentToday?: boolean;
}): ReminderCardStatus {
  const asOf = input.asOfYmd ?? todayYmdLocal();
  const label =
    input.cardDisplayLabel?.trim() || `${input.bankLabel} · ${input.cardLast4}`;
  const daysAway = daysUntilYmd(input.dueDateYmd, asOf);
  const windowDays = input.windowDays;
  const firstReminderYmd = ymdAddDays(input.dueDateYmd, -windowDays);
  const daysUntilFirst = daysUntilYmd(firstReminderYmd, asOf);

  if (input.paidAt) {
    return {
      dueEntryId: input.dueEntryId,
      label,
      cardLast4: input.cardLast4,
      dueDate: input.dueDate,
      dueDateYmd: input.dueDateYmd,
      daysAway,
      windowDays,
      inWindow: false,
      paid: true,
      firstReminderYmd,
      daysUntilFirstReminder: daysUntilFirst,
      status: "paid",
      statusLabel: "Paid — no reminders",
    };
  }

  if (daysAway < 0) {
    return {
      dueEntryId: input.dueEntryId,
      label,
      cardLast4: input.cardLast4,
      dueDate: input.dueDate,
      dueDateYmd: input.dueDateYmd,
      daysAway,
      windowDays,
      inWindow: false,
      paid: false,
      firstReminderYmd,
      daysUntilFirstReminder: daysUntilFirst,
      status: "outside_window",
      statusLabel: formatDaysUntilDue(daysAway),
    };
  }

  if (daysAway > windowDays) {
    return {
      dueEntryId: input.dueEntryId,
      label,
      cardLast4: input.cardLast4,
      dueDate: input.dueDate,
      dueDateYmd: input.dueDateYmd,
      daysAway,
      windowDays,
      inWindow: false,
      paid: false,
      firstReminderYmd,
      daysUntilFirstReminder: daysUntilFirst,
      status: "outside_window",
      statusLabel: formatReminderStartsLabel(firstReminderYmd, daysUntilFirst),
    };
  }

  if (input.alreadySentToday) {
    return {
      dueEntryId: input.dueEntryId,
      label,
      cardLast4: input.cardLast4,
      dueDate: input.dueDate,
      dueDateYmd: input.dueDateYmd,
      daysAway,
      windowDays,
      inWindow: true,
      paid: false,
      firstReminderYmd,
      daysUntilFirstReminder: daysUntilFirst,
      status: "in_window_already_sent",
      statusLabel: formatReminderActiveLabel(daysAway, true),
    };
  }

  return {
    dueEntryId: input.dueEntryId,
    label,
    cardLast4: input.cardLast4,
    dueDate: input.dueDate,
    dueDateYmd: input.dueDateYmd,
    daysAway,
    windowDays,
    inWindow: true,
    paid: false,
    firstReminderYmd,
    daysUntilFirstReminder: daysUntilFirst,
    status: "in_window_ready",
    statusLabel: formatReminderActiveLabel(daysAway, false),
  };
}
