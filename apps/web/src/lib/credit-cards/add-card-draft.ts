import {
  type BankIssuer,
  type ReminderIntervalMinutes,
} from "@/lib/db/schema/credit-cards";

const ADD_CARD_DRAFT_KEY = "kame-ops:credit-card-add-draft";

export type AddCardDraft = {
  issuer: BankIssuer;
  label: string;
  fullPan: string;
  dueDay: string;
  contactLine: string;
  pdfPassword: string;
  gmailMonthOffset: string;
  reminderWindowDays: string;
  reminderIntervalMinutes: ReminderIntervalMinutes;
  notes: string;
  soaSubject: string;
  color: string;
  googleAccountId: string | null;
};

export function saveAddCardDraft(draft: AddCardDraft): void {
  if (typeof window === "undefined") return;
  sessionStorage.setItem(ADD_CARD_DRAFT_KEY, JSON.stringify(draft));
}

export function loadAddCardDraft(): AddCardDraft | null {
  if (typeof window === "undefined") return null;
  const raw = sessionStorage.getItem(ADD_CARD_DRAFT_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as AddCardDraft;
  } catch {
    return null;
  }
}

export function clearAddCardDraft(): void {
  if (typeof window === "undefined") return;
  sessionStorage.removeItem(ADD_CARD_DRAFT_KEY);
}
