import { and, eq } from "drizzle-orm";
import { z } from "zod";

import { db } from "@/lib/db";
import { integrations } from "@/lib/db/schema";
import { decryptSecret, encryptSecret } from "@/lib/utils/encryption";

const upsertSchema = z.object({
  provider: z.enum(["gmail", "google_calendar", "telegram", "slack"]),
  config: z.record(z.string()),
  isActive: z.boolean().optional(),
});

export const integrationService = {
  async list(userId: string) {
    const rows = await db.query.integrations.findMany({
      where: eq(integrations.userId, userId),
    });
    return rows.map((r) => ({
      id: r.id,
      provider: r.provider,
      isActive: r.isActive,
      lastSyncAt: r.lastSyncAt,
      createdAt: r.createdAt,
      hasConfig: !!r.configEncrypted,
    }));
  },

  async upsert(userId: string, input: z.infer<typeof upsertSchema>) {
    const data = upsertSchema.parse(input);
    const encrypted = encryptSecret(JSON.stringify(data.config));

    const existing = await db.query.integrations.findFirst({
      where: and(
        eq(integrations.userId, userId),
        eq(integrations.provider, data.provider),
      ),
    });

    if (existing) {
      const [row] = await db
        .update(integrations)
        .set({
          configEncrypted: encrypted,
          isActive: data.isActive ?? true,
        })
        .where(eq(integrations.id, existing.id))
        .returning();
      return row;
    }

    const [row] = await db
      .insert(integrations)
      .values({
        userId,
        provider: data.provider,
        configEncrypted: encrypted,
        isActive: data.isActive ?? true,
      })
      .returning();
    return row;
  },

  async getConfig<T extends Record<string, string>>(
    userId: string,
    provider: string,
  ): Promise<T | null> {
    const row = await db.query.integrations.findFirst({
      where: and(
        eq(integrations.userId, userId),
        eq(integrations.provider, provider),
        eq(integrations.isActive, true),
      ),
    });
    if (!row) return null;
    return JSON.parse(decryptSecret(row.configEncrypted)) as T;
  },

  /** Resolve user from Telegram chat ID stored in integration config. */
  async findUserIdByTelegramChatId(chatId: string): Promise<string | null> {
    const rows = await db.query.integrations.findMany({
      where: and(
        eq(integrations.provider, "telegram"),
        eq(integrations.isActive, true),
      ),
    });

    for (const row of rows) {
      const config = JSON.parse(decryptSecret(row.configEncrypted)) as {
        chatId?: string;
      };
      if (config.chatId && String(config.chatId) === String(chatId)) {
        return row.userId;
      }
    }
    return null;
  },

  /** Bot token for a user (DB integration first, then env fallback). */
  async getTelegramBotToken(userId: string): Promise<string | null> {
    const config = await this.getConfig<{ botToken?: string }>(
      userId,
      "telegram",
    );
    return config?.botToken ?? process.env.TELEGRAM_BOT_TOKEN ?? null;
  },
};
