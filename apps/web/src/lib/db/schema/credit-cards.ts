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
  jsonb,
} from "drizzle-orm/pg-core";

import { users } from "./users";

export const BANK_ISSUERS = ["metrobank", "rcbc", "bpi", "unionbank"] as const;
export type BankIssuer = (typeof BANK_ISSUERS)[number];

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
