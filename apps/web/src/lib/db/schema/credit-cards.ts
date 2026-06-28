import { relations } from "drizzle-orm";
import {
  pgTable,
  uuid,
  varchar,
  text,
  timestamp,
  integer,
  boolean,
  index,
  uniqueIndex,
  jsonb,
} from "drizzle-orm/pg-core";

import { users } from "./users";

export const BANK_ISSUERS = ["metrobank", "rcbc", "bpi", "unionbank"] as const;
export type BankIssuer = (typeof BANK_ISSUERS)[number];

/** Minutes between reminder pings while inside the due window. */
export const REMINDER_INTERVALS = [
  { value: 60, label: "Hourly" },
  { value: 120, label: "Every 2 hours" },
  { value: 240, label: "Every 4 hours" },
  { value: 720, label: "Every 12 hours" },
  { value: 1440, label: "Once per day" },
] as const;

export type ReminderIntervalMinutes =
  (typeof REMINDER_INTERVALS)[number]["value"];

export const DEFAULT_REMINDER_INTERVAL_MINUTES: ReminderIntervalMinutes = 1440;

export function normalizeReminderIntervalMinutes(
  value: number | null | undefined,
): ReminderIntervalMinutes {
  const minutes = Number(value);
  if (!Number.isFinite(minutes)) return DEFAULT_REMINDER_INTERVAL_MINUTES;
  return (
    REMINDER_INTERVALS.find((i) => i.value === minutes)?.value ??
    DEFAULT_REMINDER_INTERVAL_MINUTES
  );
}

export const BANK_ISSUER_LABELS: Record<BankIssuer, string> = {
  metrobank: "Metrobank",
  rcbc: "RCBC",
  bpi: "BPI",
  unionbank: "Unionbank",
};

export function formatBankIssuer(issuer: string): string {
  if (issuer in BANK_ISSUER_LABELS) {
    return BANK_ISSUER_LABELS[issuer as BankIssuer];
  }
  return issuer;
}

export function normalizeBankIssuer(issuer: string): BankIssuer {
  const normalized = issuer.trim().toLowerCase();
  if ((BANK_ISSUERS as readonly string[]).includes(normalized)) {
    return normalized as BankIssuer;
  }
  return "bpi";
}

/** Default Gmail SOA subject line per bank (form default + SOA search). */
export const DEFAULT_SOA_SUBJECTS: Record<BankIssuer, string> = {
  metrobank: "Metrobank Credit Card MSOA Statement of Account",
  rcbc: "FLEX VISA eStatement",
  bpi: "BPI Credit Card Electronic Statement of Account",
  unionbank: "REWARDS VISA PLATINUM Credit Card e-Statement",
};

export function defaultSoaSubject(issuer: BankIssuer): string {
  return DEFAULT_SOA_SUBJECTS[issuer];
}

export function normalizeSoaSubject(
  value: string | null | undefined,
  issuer: BankIssuer,
): string {
  const trimmed = value?.trim();
  return trimmed || DEFAULT_SOA_SUBJECTS[issuer];
}

/** Null/blank or bank default → use legacy bank.buildQuery (matches CLI). Custom only when user overrides. */
export function effectiveSoaSubject(
  value: string | null | undefined,
  issuer: BankIssuer,
): string | undefined {
  const trimmed = value?.trim();
  if (!trimmed) return undefined;
  if (trimmed === DEFAULT_SOA_SUBJECTS[issuer]) return undefined;
  return trimmed;
}

export function soaSubjectForStorage(
  value: string | null | undefined,
  issuer: BankIssuer,
): string | null {
  const trimmed = value?.trim();
  if (!trimmed || trimmed === DEFAULT_SOA_SUBJECTS[issuer]) return null;
  return trimmed;
}

/** Default accent colors for new cards (hex). */
export const DEFAULT_CARD_COLORS: Record<BankIssuer, string> = {
  metrobank: "#00156D",
  rcbc: "#3884D9",
  bpi: "#B11116",
  unionbank: "#F7931E",
};

const HEX_COLOR_RE = /^#[0-9A-Fa-f]{6}$/;

export function isValidCardColor(
  value: string | null | undefined,
): value is string {
  return !!value && HEX_COLOR_RE.test(value);
}

export function normalizeCardColor(
  value: string | null | undefined,
  issuer?: BankIssuer,
): string | null {
  if (isValidCardColor(value)) return value.toUpperCase();
  if (issuer) return DEFAULT_CARD_COLORS[issuer];
  return null;
}

export const creditCards = pgTable(
  "credit_cards",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    issuer: varchar("issuer", { length: 32 }).notNull(),
    last4: varchar("last4", { length: 4 }).notNull(),
    label: varchar("label", { length: 255 }),
    fullPan: varchar("full_pan", { length: 64 }),
    contactLine: text("contact_line"),
    pdfPasswordEncrypted: text("pdf_password_encrypted").notNull(),
    gmailMonthOffset: integer("gmail_month_offset").default(0),
    /** Gmail subject line hint for SOA search (null = bank default query). */
    soaSubject: text("soa_subject"),
    /** Hex accent color (#RRGGBB) for SOA and card UI. */
    color: varchar("color", { length: 7 }),
    /** Days before due date to start reminders (null = use global default). */
    reminderWindowDays: integer("reminder_window_days"),
    /** Minutes between pings while in window (default once per day). */
    reminderIntervalMinutes: integer("reminder_interval_minutes")
      .notNull()
      .default(1440),
    notes: text("notes"),
    isActive: boolean("is_active").notNull().default(true),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at")
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
    deletedAt: timestamp("deleted_at"),
  },
  (table) => [
    index("credit_cards_user_idx").on(table.userId),
    index("credit_cards_issuer_last4_idx").on(table.issuer, table.last4),
  ],
);

export const soaStatements = pgTable(
  "soa_statements",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    creditCardId: uuid("credit_card_id").references(() => creditCards.id, {
      onDelete: "set null",
    }),
    statementMonth: integer("statement_month").notNull(),
    statementYear: integer("statement_year").notNull(),
    bankLabel: varchar("bank_label", { length: 64 }).notNull(),
    issuerId: varchar("issuer_id", { length: 32 }).notNull(),
    cardLast4: varchar("card_last4", { length: 4 }).notNull(),
    sourceEmailSubject: text("source_email_subject"),
    sourceMessageId: varchar("source_message_id", { length: 128 }),
    pdfFileName: varchar("pdf_file_name", { length: 512 }),
    pdfStoragePath: text("pdf_storage_path"),
    summaryPdfPath: text("summary_pdf_path"),
    minimumDue: varchar("minimum_due", { length: 64 }),
    totalDue: varchar("total_due", { length: 64 }),
    statementDate: varchar("statement_date", { length: 64 }),
    dueDate: varchar("due_date", { length: 64 }),
    dueDateYmd: varchar("due_date_ymd", { length: 10 }),
    parseNotes: text("parse_notes"),
    soaUnavailable: boolean("soa_unavailable").default(false),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => [
    index("soa_statements_user_idx").on(table.userId),
    index("soa_statements_period_idx").on(
      table.statementYear,
      table.statementMonth,
    ),
  ],
);

export const soaPeriods = pgTable(
  "soa_periods",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    mode: varchar("mode", { length: 16 }).notNull().default("single"),
    fromMonth: integer("from_month").notNull(),
    fromYear: integer("from_year").notNull(),
    toMonth: integer("to_month").notNull(),
    toYear: integer("to_year").notNull(),
    notifyTelegram: boolean("notify_telegram").notNull().default(true),
    notifySlack: boolean("notify_slack").notNull().default(true),
    createCalendar: boolean("create_calendar").notNull().default(false),
    summaryPdfStoragePath: text("summary_pdf_storage_path"),
    lastRunAt: timestamp("last_run_at"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at")
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    index("soa_periods_user_idx").on(table.userId),
    uniqueIndex("soa_periods_range_uidx").on(
      table.userId,
      table.fromMonth,
      table.fromYear,
      table.toMonth,
      table.toYear,
    ),
  ],
);

export const soaTransactions = pgTable(
  "soa_transactions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    soaStatementId: uuid("soa_statement_id")
      .notNull()
      .references(() => soaStatements.id, { onDelete: "cascade" }),
    date: varchar("date", { length: 32 }),
    description: text("description").notNull(),
    amount: varchar("amount", { length: 32 }).notNull(),
    categorySlug: varchar("category_slug", { length: 32 }),
    categorySource: varchar("category_source", { length: 16 }),
  },
  (table) => [index("soa_transactions_statement_idx").on(table.soaStatementId)],
);

export const dueEntries = pgTable(
  "due_entries",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    creditCardId: uuid("credit_card_id").references(() => creditCards.id, {
      onDelete: "set null",
    }),
    issuerId: varchar("issuer_id", { length: 32 }).notNull(),
    cardLast4: varchar("card_last4", { length: 4 }).notNull(),
    bankLabel: varchar("bank_label", { length: 64 }).notNull(),
    cardDisplayLabel: varchar("card_display_label", { length: 255 }),
    fullPan: varchar("full_pan", { length: 64 }),
    dueDate: varchar("due_date", { length: 64 }).notNull(),
    dueDateYmd: varchar("due_date_ymd", { length: 10 }).notNull(),
    minimumDue: varchar("minimum_due", { length: 64 }).notNull(),
    totalDue: varchar("total_due", { length: 64 }).notNull(),
    interestCharges: varchar("interest_charges", { length: 64 }),
    contactLine: text("contact_line"),
    paidAt: timestamp("paid_at"),
    paidAmount: varchar("paid_amount", { length: 64 }),
    receiptId: uuid("receipt_id"),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => [
    index("due_entries_user_idx").on(table.userId),
    index("due_entries_due_ymd_idx").on(table.dueDateYmd),
    index("due_entries_card_idx").on(table.issuerId, table.cardLast4),
  ],
);

export const creditCardsRelations = relations(creditCards, ({ one, many }) => ({
  user: one(users, { fields: [creditCards.userId], references: [users.id] }),
  statements: many(soaStatements),
  dueEntries: many(dueEntries),
}));

export const soaPeriodsRelations = relations(soaPeriods, ({ one }) => ({
  user: one(users, { fields: [soaPeriods.userId], references: [users.id] }),
}));

export const soaStatementsRelations = relations(
  soaStatements,
  ({ one, many }) => ({
    user: one(users, {
      fields: [soaStatements.userId],
      references: [users.id],
    }),
    creditCard: one(creditCards, {
      fields: [soaStatements.creditCardId],
      references: [creditCards.id],
    }),
    transactions: many(soaTransactions),
  }),
);

export const soaTransactionsRelations = relations(
  soaTransactions,
  ({ one }) => ({
    statement: one(soaStatements, {
      fields: [soaTransactions.soaStatementId],
      references: [soaStatements.id],
    }),
  }),
);

export const dueEntriesRelations = relations(dueEntries, ({ one }) => ({
  user: one(users, { fields: [dueEntries.userId], references: [users.id] }),
  creditCard: one(creditCards, {
    fields: [dueEntries.creditCardId],
    references: [creditCards.id],
  }),
}));
