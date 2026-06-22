import {
  pgTable,
  uuid,
  varchar,
  integer,
  timestamp,
  index,
  uniqueIndex,
} from "drizzle-orm/pg-core";

import { users } from "./users";

export const transactionCategoryRules = pgTable(
  "transaction_category_rules",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    keyword: varchar("keyword", { length: 128 }).notNull(),
    categorySlug: varchar("category_slug", { length: 32 }).notNull(),
    priority: integer("priority").notNull().default(0),
    /** `user` = settings UI; `learned` = from manual transaction correction */
    source: varchar("source", { length: 16 }).notNull().default("user"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at")
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    index("transaction_category_rules_user_idx").on(table.userId),
    uniqueIndex("transaction_category_rules_user_keyword_uidx").on(
      table.userId,
      table.keyword,
    ),
  ],
);
