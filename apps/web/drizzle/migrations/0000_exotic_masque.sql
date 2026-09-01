CREATE TABLE "accounts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"type" varchar(255) NOT NULL,
	"provider" varchar(255) NOT NULL,
	"provider_account_id" varchar(255) NOT NULL,
	"refresh_token" text,
	"access_token" text,
	"expires_at" timestamp,
	"token_type" varchar(255),
	"scope" varchar(255),
	"id_token" text,
	"session_state" varchar(255),
	"google_email" varchar(255),
	"google_name" varchar(255)
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"session_token" varchar(255) NOT NULL,
	"user_id" uuid NOT NULL,
	"expires" timestamp NOT NULL,
	CONSTRAINT "sessions_session_token_unique" UNIQUE("session_token")
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" varchar(255) NOT NULL,
	"email_verified" timestamp,
	"name" varchar(255),
	"image" text,
	"password" varchar(255),
	"timezone" varchar(64) DEFAULT 'Asia/Manila',
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"deleted_at" timestamp,
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "verification_tokens" (
	"identifier" varchar(255) NOT NULL,
	"token" varchar(255) NOT NULL,
	"expires" timestamp NOT NULL,
	CONSTRAINT "verification_tokens_token_unique" UNIQUE("token")
);
--> statement-breakpoint
CREATE TABLE "credit_cards" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"issuer" varchar(32) NOT NULL,
	"last4" varchar(4) NOT NULL,
	"label" varchar(255),
	"full_pan" varchar(64),
	"contact_line" text,
	"pdf_password_encrypted" text NOT NULL,
	"gmail_month_offset" integer DEFAULT 0,
	"soa_subject" text,
	"due_day" integer,
	"color" varchar(7),
	"reminder_window_days" integer,
	"reminder_interval_minutes" integer DEFAULT 1440 NOT NULL,
	"google_account_id" uuid,
	"notes" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"deleted_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "due_entries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"credit_card_id" uuid,
	"issuer_id" varchar(32) NOT NULL,
	"card_last4" varchar(4) NOT NULL,
	"bank_label" varchar(64) NOT NULL,
	"card_display_label" varchar(255),
	"full_pan" varchar(64),
	"due_date" varchar(64) NOT NULL,
	"due_date_ymd" varchar(10) NOT NULL,
	"minimum_due" varchar(64) NOT NULL,
	"total_due" varchar(64) NOT NULL,
	"interest_charges" varchar(64),
	"contact_line" text,
	"source" varchar(16) DEFAULT 'soa' NOT NULL,
	"paid_at" timestamp,
	"paid_amount" varchar(64),
	"receipt_id" uuid,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "soa_periods" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"mode" varchar(16) DEFAULT 'single' NOT NULL,
	"from_month" integer NOT NULL,
	"from_year" integer NOT NULL,
	"to_month" integer NOT NULL,
	"to_year" integer NOT NULL,
	"notify_telegram" boolean DEFAULT true NOT NULL,
	"notify_slack" boolean DEFAULT true NOT NULL,
	"create_calendar" boolean DEFAULT false NOT NULL,
	"summary_pdf_storage_path" text,
	"last_run_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "soa_statements" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"credit_card_id" uuid,
	"statement_month" integer NOT NULL,
	"statement_year" integer NOT NULL,
	"bank_label" varchar(64) NOT NULL,
	"issuer_id" varchar(32) NOT NULL,
	"card_last4" varchar(4) NOT NULL,
	"source_email_subject" text,
	"source_message_id" varchar(128),
	"pdf_file_name" varchar(512),
	"pdf_storage_path" text,
	"summary_pdf_path" text,
	"minimum_due" varchar(64),
	"total_due" varchar(64),
	"statement_date" varchar(64),
	"due_date" varchar(64),
	"due_date_ymd" varchar(10),
	"parse_notes" text,
	"soa_unavailable" boolean DEFAULT false,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "soa_transactions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"soa_statement_id" uuid NOT NULL,
	"date" varchar(32),
	"description" text NOT NULL,
	"amount" varchar(32) NOT NULL,
	"category_slug" varchar(32),
	"category_source" varchar(16)
);
--> statement-breakpoint
CREATE TABLE "activity_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"action" varchar(128) NOT NULL,
	"entity_type" varchar(64),
	"entity_id" uuid,
	"metadata" jsonb,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ai_categorize_progress" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"status" varchar(16) DEFAULT 'running' NOT NULL,
	"progress" integer DEFAULT 0 NOT NULL,
	"steps" jsonb NOT NULL,
	"detail" text,
	"error" text,
	"ai_batch_index" integer DEFAULT 0 NOT NULL,
	"ai_batch_total" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "automation_jobs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"name" varchar(255) NOT NULL,
	"description" text,
	"schedule" varchar(64) NOT NULL,
	"job_type" varchar(64) NOT NULL,
	"config" jsonb DEFAULT '{}'::jsonb,
	"is_active" boolean DEFAULT true NOT NULL,
	"last_run_at" timestamp,
	"next_run_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "automation_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"job_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"status" varchar(32) NOT NULL,
	"started_at" timestamp DEFAULT now() NOT NULL,
	"completed_at" timestamp,
	"result_summary" text,
	"error_message" text,
	"metadata" jsonb
);
--> statement-breakpoint
CREATE TABLE "due_action_progress" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"action" varchar(16) NOT NULL,
	"status" varchar(16) DEFAULT 'running' NOT NULL,
	"progress" integer DEFAULT 0 NOT NULL,
	"steps" jsonb NOT NULL,
	"detail" text,
	"error" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "integrations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"provider" varchar(32) NOT NULL,
	"config_encrypted" text NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"last_sync_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "receipt_upload_progress" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"status" varchar(16) DEFAULT 'running' NOT NULL,
	"progress" integer DEFAULT 0 NOT NULL,
	"steps" jsonb NOT NULL,
	"detail" text,
	"error" text,
	"item_index" integer DEFAULT 1 NOT NULL,
	"item_total" integer DEFAULT 1 NOT NULL,
	"items_completed" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "receipts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"storage_path" text NOT NULL,
	"original_file_name" varchar(512),
	"parsed_card_last4" varchar(4),
	"parsed_amount" varchar(32),
	"parsed_amount_raw" varchar(64),
	"bank_detected" varchar(64),
	"ai_verdict" varchar(32),
	"ai_summary" text,
	"ai_provider" varchar(16),
	"ai_analysis" jsonb,
	"due_entry_id" uuid,
	"payment_status" varchar(32) DEFAULT 'pending',
	"status" varchar(32) DEFAULT 'pending',
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "reminder_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"reminder_id" uuid,
	"channel" varchar(32) NOT NULL,
	"fingerprint" varchar(255) NOT NULL,
	"sent_at" timestamp DEFAULT now() NOT NULL,
	"status" varchar(32) DEFAULT 'sent'
);
--> statement-breakpoint
CREATE TABLE "reminder_run_progress" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"status" varchar(16) DEFAULT 'running' NOT NULL,
	"progress" integer DEFAULT 0 NOT NULL,
	"steps" jsonb NOT NULL,
	"detail" text,
	"error" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "reminders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"title" varchar(255) NOT NULL,
	"description" text,
	"due_date_ymd" varchar(10) NOT NULL,
	"category" varchar(64) DEFAULT 'credit_card',
	"related_entity_type" varchar(64),
	"related_entity_id" uuid,
	"window_days" integer DEFAULT 4 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"completed_at" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "soa_run_progress" (
	"id" uuid PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"status" varchar(16) DEFAULT 'running' NOT NULL,
	"progress" integer DEFAULT 0 NOT NULL,
	"steps" jsonb NOT NULL,
	"detail" text,
	"error" text,
	"month_count" integer DEFAULT 1 NOT NULL,
	"gmail_month_index" integer DEFAULT 0 NOT NULL,
	"parse_month_index" integer DEFAULT 0 NOT NULL,
	"parse_file_fraction" integer DEFAULT 0 NOT NULL,
	"upload_fraction" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "transaction_category_rules" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"keyword" varchar(128) NOT NULL,
	"category_slug" varchar(32) NOT NULL,
	"priority" integer DEFAULT 0 NOT NULL,
	"source" varchar(16) DEFAULT 'user' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_transaction_categories" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"slug" varchar(32) NOT NULL,
	"label" varchar(64) NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ai_api_keys" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"provider" varchar(16) NOT NULL,
	"label" varchar(80),
	"key_encrypted" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "accounts" ADD CONSTRAINT "accounts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "credit_cards" ADD CONSTRAINT "credit_cards_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "credit_cards" ADD CONSTRAINT "credit_cards_google_account_id_accounts_id_fk" FOREIGN KEY ("google_account_id") REFERENCES "public"."accounts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "due_entries" ADD CONSTRAINT "due_entries_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "due_entries" ADD CONSTRAINT "due_entries_credit_card_id_credit_cards_id_fk" FOREIGN KEY ("credit_card_id") REFERENCES "public"."credit_cards"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "soa_periods" ADD CONSTRAINT "soa_periods_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "soa_statements" ADD CONSTRAINT "soa_statements_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "soa_statements" ADD CONSTRAINT "soa_statements_credit_card_id_credit_cards_id_fk" FOREIGN KEY ("credit_card_id") REFERENCES "public"."credit_cards"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "soa_transactions" ADD CONSTRAINT "soa_transactions_soa_statement_id_soa_statements_id_fk" FOREIGN KEY ("soa_statement_id") REFERENCES "public"."soa_statements"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "activity_logs" ADD CONSTRAINT "activity_logs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_categorize_progress" ADD CONSTRAINT "ai_categorize_progress_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "automation_jobs" ADD CONSTRAINT "automation_jobs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "automation_runs" ADD CONSTRAINT "automation_runs_job_id_automation_jobs_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."automation_jobs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "automation_runs" ADD CONSTRAINT "automation_runs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "due_action_progress" ADD CONSTRAINT "due_action_progress_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "integrations" ADD CONSTRAINT "integrations_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "receipt_upload_progress" ADD CONSTRAINT "receipt_upload_progress_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "receipts" ADD CONSTRAINT "receipts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reminder_logs" ADD CONSTRAINT "reminder_logs_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reminder_logs" ADD CONSTRAINT "reminder_logs_reminder_id_reminders_id_fk" FOREIGN KEY ("reminder_id") REFERENCES "public"."reminders"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reminder_run_progress" ADD CONSTRAINT "reminder_run_progress_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reminders" ADD CONSTRAINT "reminders_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "soa_run_progress" ADD CONSTRAINT "soa_run_progress_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "transaction_category_rules" ADD CONSTRAINT "transaction_category_rules_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "user_transaction_categories" ADD CONSTRAINT "user_transaction_categories_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ai_api_keys" ADD CONSTRAINT "ai_api_keys_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "accounts_provider_idx" ON "accounts" USING btree ("provider","provider_account_id");--> statement-breakpoint
CREATE INDEX "accounts_user_provider_idx" ON "accounts" USING btree ("user_id","provider");--> statement-breakpoint
CREATE INDEX "users_email_idx" ON "users" USING btree ("email");--> statement-breakpoint
CREATE UNIQUE INDEX "verification_tokens_identifier_token_idx" ON "verification_tokens" USING btree ("identifier","token");--> statement-breakpoint
CREATE INDEX "credit_cards_user_idx" ON "credit_cards" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "credit_cards_issuer_last4_idx" ON "credit_cards" USING btree ("issuer","last4");--> statement-breakpoint
CREATE INDEX "credit_cards_google_account_idx" ON "credit_cards" USING btree ("google_account_id");--> statement-breakpoint
CREATE INDEX "due_entries_user_idx" ON "due_entries" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "due_entries_due_ymd_idx" ON "due_entries" USING btree ("due_date_ymd");--> statement-breakpoint
CREATE INDEX "due_entries_card_idx" ON "due_entries" USING btree ("issuer_id","card_last4");--> statement-breakpoint
CREATE INDEX "soa_periods_user_idx" ON "soa_periods" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "soa_periods_range_uidx" ON "soa_periods" USING btree ("user_id","from_month","from_year","to_month","to_year");--> statement-breakpoint
CREATE INDEX "soa_statements_user_idx" ON "soa_statements" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "soa_statements_period_idx" ON "soa_statements" USING btree ("statement_year","statement_month");--> statement-breakpoint
CREATE INDEX "soa_transactions_statement_idx" ON "soa_transactions" USING btree ("soa_statement_id");--> statement-breakpoint
CREATE INDEX "activity_logs_user_idx" ON "activity_logs" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "ai_categorize_progress_user_idx" ON "ai_categorize_progress" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "ai_categorize_progress_updated_idx" ON "ai_categorize_progress" USING btree ("updated_at");--> statement-breakpoint
CREATE INDEX "automation_jobs_user_idx" ON "automation_jobs" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "automation_jobs_user_reminders_uidx" ON "automation_jobs" USING btree ("user_id") WHERE "automation_jobs"."job_type" = 'send_due_reminders';--> statement-breakpoint
CREATE UNIQUE INDEX "automation_jobs_user_soa_pipeline_uidx" ON "automation_jobs" USING btree ("user_id") WHERE "automation_jobs"."job_type" = 'run_soa_pipeline';--> statement-breakpoint
CREATE INDEX "automation_runs_job_idx" ON "automation_runs" USING btree ("job_id");--> statement-breakpoint
CREATE INDEX "automation_runs_user_idx" ON "automation_runs" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "due_action_progress_user_idx" ON "due_action_progress" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "due_action_progress_updated_idx" ON "due_action_progress" USING btree ("updated_at");--> statement-breakpoint
CREATE INDEX "integrations_user_provider_idx" ON "integrations" USING btree ("user_id","provider");--> statement-breakpoint
CREATE INDEX "receipt_upload_progress_user_idx" ON "receipt_upload_progress" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "receipt_upload_progress_updated_idx" ON "receipt_upload_progress" USING btree ("updated_at");--> statement-breakpoint
CREATE INDEX "receipts_user_idx" ON "receipts" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "reminder_logs_fingerprint_idx" ON "reminder_logs" USING btree ("fingerprint");--> statement-breakpoint
CREATE INDEX "reminder_logs_user_idx" ON "reminder_logs" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "reminder_run_progress_user_idx" ON "reminder_run_progress" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "reminder_run_progress_updated_idx" ON "reminder_run_progress" USING btree ("updated_at");--> statement-breakpoint
CREATE INDEX "reminders_user_due_idx" ON "reminders" USING btree ("user_id","due_date_ymd");--> statement-breakpoint
CREATE INDEX "soa_run_progress_user_idx" ON "soa_run_progress" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "soa_run_progress_updated_idx" ON "soa_run_progress" USING btree ("updated_at");--> statement-breakpoint
CREATE INDEX "transaction_category_rules_user_idx" ON "transaction_category_rules" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "transaction_category_rules_user_keyword_uidx" ON "transaction_category_rules" USING btree ("user_id","keyword");--> statement-breakpoint
CREATE INDEX "user_tx_categories_user_idx" ON "user_transaction_categories" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "user_tx_categories_user_slug_uidx" ON "user_transaction_categories" USING btree ("user_id","slug");--> statement-breakpoint
CREATE UNIQUE INDEX "user_tx_categories_user_label_uidx" ON "user_transaction_categories" USING btree ("user_id","label");--> statement-breakpoint
CREATE INDEX "ai_api_keys_user_provider_idx" ON "ai_api_keys" USING btree ("user_id","provider");