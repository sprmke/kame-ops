import { z } from "zod";

import { protectedProcedure, router } from "@/server/trpc";
import { aiApiKeyService } from "@/server/services/ai-api-key.service";
import {
  GROQ_MODEL,
  GEMINI_MODEL,
  verifyGroqApiKey,
  verifyGeminiApiKey,
} from "@/server/services/receipt-validation.service";

export const aiKeysRouter = router({
  getFormConfig: protectedProcedure.query(async ({ ctx }) =>
    aiApiKeyService.getFormConfig(ctx.user.id, {
      gemini: GEMINI_MODEL,
      groq: GROQ_MODEL,
    }),
  ),

  save: protectedProcedure
    .input(
      z.object({
        provider: z.enum(["gemini", "groq"]),
        keys: z.string(),
      }),
    )
    .mutation(({ ctx, input }) => aiApiKeyService.save(ctx.user.id, input)),

  verify: protectedProcedure
    .input(
      z.object({
        provider: z.enum(["gemini", "groq"]),
        keys: z.string().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const resolved = await aiApiKeyService.resolveKeysForProvider(
        ctx.user.id,
        input.provider,
        input.keys,
      );

      if (resolved.length === 0) {
        return {
          provider: input.provider,
          results: [],
        };
      }

      const results = await Promise.all(
        resolved.map(async (apiKey, index) => {
          const result =
            input.provider === "gemini"
              ? await verifyGeminiApiKey(apiKey)
              : await verifyGroqApiKey(apiKey);
          return { ...result, index };
        }),
      );

      return {
        provider: input.provider,
        results,
      };
    }),
});
