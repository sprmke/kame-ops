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

export const INTEGRATION_PROVIDERS = [
  "gmail",
  "google_calendar",
  "telegram",
  "slack",
] as const;

export const integrations = pgTable(
  "integrations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    provider: varchar("provider", { length: 32 }).notNull(),
    configEncrypted: text("config_encrypted").notNull(),
    isActive: boolean("is_active").notNull().default(true),
    lastSyncAt: timestamp("last_sync_at"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at")
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    index("integrations_user_provider_idx").on(table.userId, table.provider),
  ],
);

export const reminders = pgTable(
  "reminders",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    title: varchar("title", { length: 255 }).notNull(),
    description: text("description"),
    dueDateYmd: varchar("due_date_ymd", { length: 10 }).notNull(),
    category: varchar("category", { length: 64 }).default("credit_card"),
    relatedEntityType: varchar("related_entity_type", { length: 64 }),
    relatedEntityId: uuid("related_entity_id"),
    windowDays: integer("window_days").notNull().default(4),
    isActive: boolean("is_active").notNull().default(true),
    completedAt: timestamp("completed_at"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at")
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    index("reminders_user_due_idx").on(table.userId, table.dueDateYmd),
  ],
);

export const reminderLogs = pgTable(
  "reminder_logs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    reminderId: uuid("reminder_id").references(() => reminders.id, {
      onDelete: "set null",
    }),
    channel: varchar("channel", { length: 32 }).notNull(),
    fingerprint: varchar("fingerprint", { length: 255 }).notNull(),
    sentAt: timestamp("sent_at").notNull().defaultNow(),
    status: varchar("status", { length: 32 }).default("sent"),
  },
  (table) => [
    index("reminder_logs_fingerprint_idx").on(table.fingerprint),
    index("reminder_logs_user_idx").on(table.userId),
  ],
);

export const automationJobs = pgTable(
  "automation_jobs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    name: varchar("name", { length: 255 }).notNull(),
    description: text("description"),
    schedule: varchar("schedule", { length: 64 }).notNull(),
    jobType: varchar("job_type", { length: 64 }).notNull(),
    config: jsonb("config").$type<Record<string, unknown>>().default({}),
    isActive: boolean("is_active").notNull().default(true),
    lastRunAt: timestamp("last_run_at"),
    nextRunAt: timestamp("next_run_at"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at")
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [index("automation_jobs_user_idx").on(table.userId)],
);

export const automationRuns = pgTable(
  "automation_runs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    jobId: uuid("job_id")
      .notNull()
      .references(() => automationJobs.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    status: varchar("status", { length: 32 }).notNull(),
    startedAt: timestamp("started_at").notNull().defaultNow(),
    completedAt: timestamp("completed_at"),
    resultSummary: text("result_summary"),
    errorMessage: text("error_message"),
    metadata: jsonb("metadata").$type<Record<string, unknown>>(),
  },
  (table) => [
    index("automation_runs_job_idx").on(table.jobId),
    index("automation_runs_user_idx").on(table.userId),
  ],
);

export const receipts = pgTable(
  "receipts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    storagePath: text("storage_path").notNull(),
    originalFileName: varchar("original_file_name", { length: 512 }),
    parsedCardLast4: varchar("parsed_card_last4", { length: 4 }),
    parsedAmount: varchar("parsed_amount", { length: 32 }),
    parsedAmountRaw: varchar("parsed_amount_raw", { length: 64 }),
    bankDetected: varchar("bank_detected", { length: 64 }),
    aiVerdict: varchar("ai_verdict", { length: 32 }),
    aiSummary: text("ai_summary"),
    aiProvider: varchar("ai_provider", { length: 16 }),
    aiAnalysis: jsonb("ai_analysis").$type<{
      confidence?: number | null;
      hasAmount?: boolean;
      hasDate?: boolean;
      hasReference?: boolean;
      isCreditCardPayment?: boolean;
      paymentDate?: string;
      referenceNumber?: string;
      aiModelError?: string;
    }>(),
    dueEntryId: uuid("due_entry_id"),
    paymentStatus: varchar("payment_status", { length: 32 }).default("pending"),
    status: varchar("status", { length: 32 }).default("pending"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => [index("receipts_user_idx").on(table.userId)],
);

export const activityLogs = pgTable(
  "activity_logs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    action: varchar("action", { length: 128 }).notNull(),
    entityType: varchar("entity_type", { length: 64 }),
    entityId: uuid("entity_id"),
    metadata: jsonb("metadata").$type<Record<string, unknown>>(),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => [index("activity_logs_user_idx").on(table.userId)],
);

export const receiptUploadProgress = pgTable(
  "receipt_upload_progress",
  {
    id: uuid("id").primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    status: varchar("status", { length: 16 }).notNull().default("running"),
    progress: integer("progress").notNull().default(0),
    steps: jsonb("steps")
      .$type<
        import("@/lib/receipt-upload-progress").ReceiptUploadStepSnapshot[]
      >()
      .notNull(),
    detail: text("detail"),
    error: text("error"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at")
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    index("receipt_upload_progress_user_idx").on(table.userId),
    index("receipt_upload_progress_updated_idx").on(table.updatedAt),
  ],
);

export const soaRunProgress = pgTable(
  "soa_run_progress",
  {
    id: uuid("id").primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    status: varchar("status", { length: 16 }).notNull().default("running"),
    progress: integer("progress").notNull().default(0),
    steps: jsonb("steps")
      .$type<import("@/lib/soa-run-progress").SoaRunStepSnapshot[]>()
      .notNull(),
    detail: text("detail"),
    error: text("error"),
    monthCount: integer("month_count").notNull().default(1),
    gmailMonthIndex: integer("gmail_month_index").notNull().default(0),
    parseMonthIndex: integer("parse_month_index").notNull().default(0),
    parseFileFraction: integer("parse_file_fraction").notNull().default(0),
    uploadFraction: integer("upload_fraction").notNull().default(0),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at")
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    index("soa_run_progress_user_idx").on(table.userId),
    index("soa_run_progress_updated_idx").on(table.updatedAt),
  ],
);

export const integrationsRelations = relations(integrations, ({ one }) => ({
  user: one(users, { fields: [integrations.userId], references: [users.id] }),
}));

export const remindersRelations = relations(reminders, ({ one, many }) => ({
  user: one(users, { fields: [reminders.userId], references: [users.id] }),
  logs: many(reminderLogs),
}));

export const reminderLogsRelations = relations(reminderLogs, ({ one }) => ({
  user: one(users, { fields: [reminderLogs.userId], references: [users.id] }),
  reminder: one(reminders, {
    fields: [reminderLogs.reminderId],
    references: [reminders.id],
  }),
}));

export const automationJobsRelations = relations(
  automationJobs,
  ({ one, many }) => ({
    user: one(users, {
      fields: [automationJobs.userId],
      references: [users.id],
    }),
    runs: many(automationRuns),
  }),
);

export const automationRunsRelations = relations(automationRuns, ({ one }) => ({
  job: one(automationJobs, {
    fields: [automationRuns.jobId],
    references: [automationJobs.id],
  }),
  user: one(users, { fields: [automationRuns.userId], references: [users.id] }),
}));

export const receiptsRelations = relations(receipts, ({ one }) => ({
  user: one(users, { fields: [receipts.userId], references: [users.id] }),
}));
