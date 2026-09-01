// @ts-nocheck
export type CardCredential = {
  issuer: string;
  last4: string;
  password: string;
  /**
   * Gmail `after:`/`before:` and subject month tokens use this shift vs the run’s target period.
   * Example: `-1` = search the previous calendar month (some banks email the SOA early).
   * Default: `0`.
   */
  gmailMonthOffset?: number;
  /** Shown in the overview “Bank” column instead of the issuer default label (e.g. Metrobank M Free). */
  label?: string;
  /** Full card number as you want it printed (e.g. groups of 4). Shown on the summary PDF. */
  fullPan?: string;
  /** Hotline, IVR steps, hours — printed under the card heading in the transaction section. */
  contactLine?: string;
  /** Override global DUE_REMINDERS_WINDOW_DAYS for this card. */
  reminderWindowDays?: number;
  /** Minutes between pings while in the due window (default 1440 = once per day). */
  reminderIntervalMinutes?: number;
  /** Gmail subject line for SOA search (overrides bank default when set). */
  soaSubject?: string;
  /** Google OAuth account id for Gmail SOA fetch. */
  googleAccountId?: string;
};

export type TransactionLine = {
  date: string;
  description: string;
  amount: string;
};

export type SoaRow = {
  bankLabel: string;
  issuerId: string;
  cardLast4: string;
  /** From CARDS_JSON.label when matched on issuer + last4. */
  cardDisplayLabel?: string;
  /** From CARDS_JSON.fullPan when matched. */
  fullPan?: string;
  /** From CARDS_JSON.contactLine when matched (txn section heading subtitle, not overview). */
  contactLine?: string;
  sourceEmailSubject: string;
  sourceMessageId: string;
  pdfFileName: string;
  /** Supabase/local storage key for the source PDF (manual upload or Gmail persist). */
  pdfStoragePath?: string | null;
  minimumDue: string;
  totalDue: string;
  statementDate: string;
  dueDate: string;
  parseNotes?: string;
  /** No SOA PDF for this card/period — summary PDF shows one status instead of filling every column. */
  soaUnavailable?: boolean;
  /** Parsed posting/transaction lines (best-effort per bank). */
  transactions?: TransactionLine[];
};

export type BankDefinition = {
  id: string;
  label: string;
  /** Gmail query fragment (combined with date range). */
  buildQuery: (ctx: GmailMonthContext) => string;
};

export type GmailMonthContext = {
  year: number;
  monthIndex0: number;
  monthLong: string;
  monthShort: string;
  monthNum2: string;
  afterYMD: string;
  beforeYMD: string;
};
