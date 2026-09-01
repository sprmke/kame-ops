DELETE FROM "due_entries" AS "dup"
WHERE "dup"."id" IN (
  SELECT "id" FROM (
    SELECT "id",
      ROW_NUMBER() OVER (
        PARTITION BY "user_id", "credit_card_id", "due_date_ymd"
        ORDER BY
          CASE WHEN "source" = 'soa' THEN 0 ELSE 1 END,
          CASE WHEN "paid_at" IS NOT NULL THEN 0 ELSE 1 END,
          "updated_at" DESC
      ) AS "rn"
    FROM "due_entries"
    WHERE "credit_card_id" IS NOT NULL
  ) AS "ranked"
  WHERE "rn" > 1
);--> statement-breakpoint
CREATE UNIQUE INDEX "due_entries_user_card_due_uidx" ON "due_entries" USING btree ("user_id","credit_card_id","due_date_ymd");--> statement-breakpoint
ALTER TABLE "credit_cards" ADD CONSTRAINT "credit_cards_due_day_check" CHECK ("credit_cards"."due_day" between 1 and 31);--> statement-breakpoint
ALTER TABLE "due_entries" ADD CONSTRAINT "due_entries_source_check" CHECK ("due_entries"."source" in ('soa', 'expected'));