import "server-only";

import { and, asc, eq } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { z } from "zod";

import { resolveKeysFromInput } from "@/lib/ai/keys-input";
import type { AiKeysFormConfig, UserAiKeysSnapshot } from "@/lib/ai/types";
import { db } from "@/lib/db";
import { aiApiKeys, type AiKeyProvider } from "@/lib/db/schema";
import { encryptSecret, tryDecryptSecret } from "@/lib/utils/encryption";

const providerSchema = z.enum(["gemini", "groq"]);

const saveSchema = z.object({
  provider: providerSchema,
  keys: z.string(),
});

function decryptRowKey(keyEncrypted: string): string | null {
  return tryDecryptSecret(keyEncrypted);
}

async function getProviderRows(userId: string, provider: AiKeyProvider) {
  return db.query.aiApiKeys.findMany({
    where: and(eq(aiApiKeys.userId, userId), eq(aiApiKeys.provider, provider)),
    orderBy: [asc(aiApiKeys.createdAt)],
  });
}

async function getProviderPlainKeys(
  userId: string,
  provider: AiKeyProvider,
): Promise<string[]> {
  const rows = await getProviderRows(userId, provider);
  const keys: string[] = [];
  for (const row of rows) {
    const plain = decryptRowKey(row.keyEncrypted);
    if (plain) keys.push(plain);
  }
  return keys;
}

function resolveKeysOrThrow(raw: string, existingKeys: string[]) {
  try {
    return resolveKeysFromInput(raw, existingKeys);
  } catch (err) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: err instanceof Error ? err.message : "Invalid API keys",
    });
  }
}

/** Per-user Gemini/Groq keys from Settings (`ai_api_keys`). Never read from env. */
export const aiApiKeyService = {
  async getUserKeysSnapshot(userId: string): Promise<UserAiKeysSnapshot> {
    const [gemini, groq] = await Promise.all([
      getProviderPlainKeys(userId, "gemini"),
      getProviderPlainKeys(userId, "groq"),
    ]);
    return { gemini, groq };
  },

  async hasConfiguredKeys(userId: string): Promise<boolean> {
    const { gemini, groq } = await this.getUserKeysSnapshot(userId);
    return gemini.length > 0 || groq.length > 0;
  },

  async getFormConfig(
    userId: string,
    models: { gemini: string; groq: string },
  ): Promise<AiKeysFormConfig> {
    const rows = await db.query.aiApiKeys.findMany({
      where: eq(aiApiKeys.userId, userId),
      orderBy: [asc(aiApiKeys.createdAt)],
    });

    let secretsUnavailable = false;
    const geminiCount = rows.filter(
      (r) => r.provider === "gemini" && decryptRowKey(r.keyEncrypted),
    ).length;
    const groqCount = rows.filter(
      (r) => r.provider === "groq" && decryptRowKey(r.keyEncrypted),
    ).length;

    for (const row of rows) {
      if (!decryptRowKey(row.keyEncrypted)) {
        secretsUnavailable = true;
      }
    }

    return {
      gemini: {
        model: models.gemini,
        keyCount: geminiCount,
      },
      groq: {
        model: models.groq,
        keyCount: groqCount,
      },
      secretsUnavailable,
    };
  },

  async resolveKeysForProvider(
    userId: string,
    provider: AiKeyProvider,
    keysInput?: string,
  ): Promise<string[]> {
    if (keysInput !== undefined) {
      const existing = await getProviderPlainKeys(userId, provider);
      return resolveKeysOrThrow(keysInput, existing);
    }
    return getProviderPlainKeys(userId, provider);
  },

  async save(userId: string, input: z.infer<typeof saveSchema>) {
    const data = saveSchema.parse(input);
    const trimmed = data.keys.trim();
    if (!trimmed) {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: "Enter API keys to save",
      });
    }

    const existing = await getProviderPlainKeys(userId, data.provider);
    const resolved = resolveKeysOrThrow(trimmed, existing);

    await db.transaction(async (tx) => {
      await tx
        .delete(aiApiKeys)
        .where(
          and(
            eq(aiApiKeys.userId, userId),
            eq(aiApiKeys.provider, data.provider),
          ),
        );

      for (const apiKey of resolved) {
        await tx.insert(aiApiKeys).values({
          userId,
          provider: data.provider,
          label: null,
          keyEncrypted: encryptSecret(apiKey),
        });
      }
    });

    return { keyCount: resolved.length };
  },
};
