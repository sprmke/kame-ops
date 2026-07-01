import { relations } from "drizzle-orm";
import {
  index,
  pgTable,
  text,
  timestamp,
  uuid,
  varchar,
} from "drizzle-orm/pg-core";

import { users } from "./users";

export const AI_KEY_PROVIDERS = ["gemini", "groq"] as const;
export type AiKeyProvider = (typeof AI_KEY_PROVIDERS)[number];

export const aiApiKeys = pgTable(
  "ai_api_keys",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    provider: varchar("provider", { length: 16 }).notNull(),
    label: varchar("label", { length: 80 }),
    keyEncrypted: text("key_encrypted").notNull(),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at")
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    index("ai_api_keys_user_provider_idx").on(table.userId, table.provider),
  ],
);

export const aiApiKeysRelations = relations(aiApiKeys, ({ one }) => ({
  user: one(users, { fields: [aiApiKeys.userId], references: [users.id] }),
}));
