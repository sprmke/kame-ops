ALTER TABLE "receipt_upload_progress" ADD COLUMN IF NOT EXISTS "item_index" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "receipt_upload_progress" ADD COLUMN IF NOT EXISTS "item_total" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "receipt_upload_progress" ADD COLUMN IF NOT EXISTS "items_completed" integer DEFAULT 0 NOT NULL;
