import "server-only";

import { TRPCError } from "@trpc/server";
import { and, eq, sql } from "drizzle-orm";

import { db } from "@/lib/db";
import { soaPeriods, soaStatements, soaTransactions } from "@/lib/db/schema";
import { AI_SKIP_NO_KEYS_MESSAGE } from "@/lib/receipts/types";
import {
  type AiCategorizeScope,
  type AiCategorizeTxRow,
  type AiMerchantAssignment,
  type MerchantGroup,
  buildCompactCategorizePrompt,
  expandMerchantAssignments,
  groupTransactionsByMerchant,
  MERCHANT_BATCH_SIZE,
  parseCompactCategorizeResponse,
  selectEligibleTransactions,
} from "@/lib/transactions/ai-categorize-payload";
import {
  CANNOT_ANALYZE_SLUG,
  extractMerchantKeyword,
  isValidCategorySlug,
} from "@/lib/transactions/categories";
import { aiApiKeyService } from "./ai-api-key.service";
import { AiCategorizeProgressReporter } from "./ai-categorize-progress.service";
import {
  categorizeTransaction,
  transactionCategoryService,
} from "./transaction-category.service";

const GEMINI_MODEL = "gemini-2.5-flash";
const GROQ_MODEL = "meta-llama/llama-4-scout-17b-16e-instruct";
const GEMINI_URL = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;
const GROQ_URL = "https://api.groq.com/openai/v1/chat/completions";

export type { AiCategorizeScope };

export type AiCategorizeResult = {
  updated: number;
  createdCategories: number;
  skipped: number;
  merchantGroups: number;
  aiBatches: number;
};

function shouldTryNextProvider(status: number): boolean {
  return status === 429 || status === 403 || status >= 500;
}

function statementMonthOrdinalExpr() {
  return sql<number>`${soaStatements.statementYear} * 12 + ${soaStatements.statementMonth}`;
}

function monthOrdinal(month: number, year: number) {
  return year * 12 + month;
}

function statementsInPeriodWhere(
  userId: string,
  fromMonth: number,
  fromYear: number,
  toMonth: number,
  toYear: number,
) {
  const fromOrd = monthOrdinal(fromMonth, fromYear);
  const toOrd = monthOrdinal(toMonth, toYear);

  return and(
    eq(soaStatements.userId, userId),
    sql`${statementMonthOrdinalExpr()} >= ${fromOrd}`,
    sql`${statementMonthOrdinalExpr()} <= ${toOrd}`,
  );
}

async function callGeminiText(
  apiKey: string,
  prompt: string,
): Promise<string | null> {
  try {
    const res = await fetch(`${GEMINI_URL}?key=${encodeURIComponent(apiKey)}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: 0.1,
          responseMimeType: "application/json",
        },
      }),
      signal: AbortSignal.timeout(90_000),
    });
    if (!res.ok) {
      if (shouldTryNextProvider(res.status)) return null;
      return null;
    }
    const body = (await res.json()) as {
      candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
    };
    return body.candidates?.[0]?.content?.parts?.[0]?.text ?? null;
  } catch {
    return null;
  }
}

async function callGroqText(
  apiKey: string,
  prompt: string,
  maxTokens: number,
): Promise<string | null> {
  try {
    const res = await fetch(GROQ_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: GROQ_MODEL,
        messages: [{ role: "user", content: prompt }],
        temperature: 0.1,
        max_tokens: maxTokens,
        response_format: { type: "json_object" },
      }),
      signal: AbortSignal.timeout(90_000),
    });
    if (!res.ok) return null;
    const body = (await res.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    return body.choices?.[0]?.message?.content ?? null;
  } catch {
    return null;
  }
}

async function categorizeMerchantsWithAi(
  userId: string,
  merchants: MerchantGroup[],
  categorySlugs: string[],
): Promise<AiMerchantAssignment[]> {
  const prompt = buildCompactCategorizePrompt({
    categorySlugs,
    merchants,
  });
  const maxTokens = Math.min(8192, 256 + merchants.length * 24);
  const { gemini, groq } = await aiApiKeyService.getUserKeysSnapshot(userId);

  for (const key of gemini) {
    const text = await callGeminiText(key, prompt);
    const parsed = text ? parseCompactCategorizeResponse(text) : [];
    if (parsed.length > 0) return parsed;
  }

  for (const key of groq) {
    const text = await callGroqText(key, prompt, maxTokens);
    const parsed = text ? parseCompactCategorizeResponse(text) : [];
    if (parsed.length > 0) return parsed;
  }

  throw new TRPCError({
    code: "BAD_REQUEST",
    message: "AI categorization failed. Check your API keys in Settings.",
  });
}

function resolveWithoutAi(
  group: MerchantGroup,
  userRules: Awaited<
    ReturnType<typeof transactionCategoryService.getRulesForUser>
  >,
  customSlugs?: ReadonlySet<string>,
): string | null {
  const sample: AiCategorizeTxRow = {
    id: group.transactionIds[0]!,
    description: group.sampleDescription,
    amount: group.sampleAmount,
    categorySlug: null,
    categorySource: null,
  };
  const result = categorizeTransaction(sample, userRules, customSlugs);
  if (result.categorySlug === CANNOT_ANALYZE_SLUG) return null;
  if (result.categorySource === "system") return result.categorySlug;
  return null;
}

async function applyAssignments(
  userId: string,
  targets: AiCategorizeTxRow[],
  assignmentsByTxId: Map<string, AiMerchantAssignment>,
): Promise<{ updated: number; createdCategories: number }> {
  const labelByNewCategory = new Map<string, string>();
  const learnedKeywords = new Set<string>();
  let createdCategories = 0;
  let updated = 0;

  const updates: { txId: string; slug: string; keyword: string | null }[] = [];

  for (const tx of targets) {
    const assignment = assignmentsByTxId.get(tx.id);
    if (!assignment) continue;

    let slug = assignment.categorySlug?.trim();
    const newLabel = assignment.newCategoryLabel?.trim();

    if (
      newLabel &&
      (!slug ||
        (!(await transactionCategoryService.isAllowedCategorySlug(
          userId,
          slug,
        )) &&
          !isValidCategorySlug(slug)))
    ) {
      const cacheKey = newLabel.toLowerCase();
      let resolvedSlug = labelByNewCategory.get(cacheKey);
      if (!resolvedSlug) {
        const created = await transactionCategoryService.ensureUserCategory(
          userId,
          newLabel,
        );
        resolvedSlug = created.slug;
        labelByNewCategory.set(cacheKey, created.slug);
        createdCategories += 1;
      }
      slug = resolvedSlug;
    }

    if (!slug || slug === CANNOT_ANALYZE_SLUG) continue;

    const allowed =
      isValidCategorySlug(slug) ||
      (await transactionCategoryService.isAllowedCategorySlug(userId, slug));
    if (!allowed) continue;

    const keyword = extractMerchantKeyword(tx.description);
    updates.push({ txId: tx.id, slug, keyword });
  }

  const chunkSize = 50;
  for (let i = 0; i < updates.length; i += chunkSize) {
    const chunk = updates.slice(i, i + chunkSize);
    await Promise.all(
      chunk.map(({ txId, slug }) =>
        db
          .update(soaTransactions)
          .set({
            categorySlug: slug,
            categorySource: "ai",
          })
          .where(eq(soaTransactions.id, txId)),
      ),
    );
    updated += chunk.length;
  }

  for (const { keyword, slug } of updates) {
    if (!keyword || learnedKeywords.has(keyword)) continue;
    learnedKeywords.add(keyword);
    await transactionCategoryService.createRule(userId, {
      keyword,
      categorySlug: slug,
      priority: 40,
      source: "learned",
    });
  }

  return { updated, createdCategories };
}

async function categorizeTransactionRows(
  userId: string,
  targets: AiCategorizeTxRow[],
  reporter: AiCategorizeProgressReporter | null = null,
): Promise<AiCategorizeResult> {
  if (!targets.length) {
    await reporter?.complete();
    return {
      updated: 0,
      createdCategories: 0,
      skipped: 0,
      merchantGroups: 0,
      aiBatches: 0,
    };
  }

  await reporter?.activate(
    "prepare",
    `${targets.length} transaction${targets.length === 1 ? "" : "s"}`,
  );

  const userRules = await transactionCategoryService.getRulesForUser(userId);
  const customLabels =
    await transactionCategoryService.getCustomLabelMap(userId);
  const customSlugs = new Set(customLabels.keys());
  let categorySlugs = (
    await transactionCategoryService.listOptions(userId)
  ).map((row) => row.slug);

  await reporter?.completeStep("prepare");
  await reporter?.activate("match_rules", "Checking keyword rules");

  const merchantGroups = groupTransactionsByMerchant(targets);
  const assignmentsByTxId = new Map<string, AiMerchantAssignment>();
  const needsAi: MerchantGroup[] = [];

  for (const group of merchantGroups) {
    const systemSlug = resolveWithoutAi(group, userRules, customSlugs);
    if (systemSlug) {
      for (const txId of group.transactionIds) {
        assignmentsByTxId.set(txId, {
          merchantId: group.merchantId,
          categorySlug: systemSlug,
        });
      }
      continue;
    }
    needsAi.push(group);
  }

  await reporter?.completeStep("match_rules");

  const totalBatches = Math.ceil(needsAi.length / MERCHANT_BATCH_SIZE);
  let aiBatches = 0;

  if (needsAi.length === 0) {
    await reporter?.activate("ai", "No AI needed");
    await reporter?.completeStep("ai");
  } else {
    await reporter?.setAiBatchProgress(
      0,
      totalBatches,
      `Batch 1 of ${totalBatches}`,
    );
    await reporter?.activate("ai");

    for (let i = 0; i < needsAi.length; i += MERCHANT_BATCH_SIZE) {
      const batchNum = Math.floor(i / MERCHANT_BATCH_SIZE) + 1;
      if (batchNum > 1) {
        await reporter?.setAiBatchProgress(
          batchNum - 1,
          totalBatches,
          `Batch ${batchNum} of ${totalBatches}`,
        );
      }
      const batch = needsAi.slice(i, i + MERCHANT_BATCH_SIZE);
      aiBatches += 1;
      const merchantAssignments = await categorizeMerchantsWithAi(
        userId,
        batch,
        categorySlugs,
      );
      const expanded = expandMerchantAssignments(batch, merchantAssignments);
      for (const [txId, assignment] of expanded) {
        assignmentsByTxId.set(txId, assignment);
      }
      await reporter?.setAiBatchProgress(
        batchNum,
        totalBatches,
        `Batch ${batchNum} of ${totalBatches} done`,
      );
    }
    await reporter?.completeStep("ai");
  }

  await reporter?.activate("save", "Writing categories");
  const { updated, createdCategories } = await applyAssignments(
    userId,
    targets,
    assignmentsByTxId,
  );
  await reporter?.completeStep("save");
  await reporter?.complete();

  return {
    updated,
    createdCategories,
    skipped: targets.length - updated,
    merchantGroups: merchantGroups.length,
    aiBatches,
  };
}

async function assertAiKeys(userId: string) {
  if (!(await aiApiKeyService.hasConfiguredKeys(userId))) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: AI_SKIP_NO_KEYS_MESSAGE,
    });
  }
}

export const transactionCategoryAiService = {
  async categorizeStatementWithAi(
    userId: string,
    statementId: string,
    scope: AiCategorizeScope,
    processId?: string,
  ): Promise<AiCategorizeResult> {
    await assertAiKeys(userId);

    let reporter: AiCategorizeProgressReporter | null = null;
    if (processId) {
      reporter = await AiCategorizeProgressReporter.create(userId, processId);
    }

    try {
      const statement = await db.query.soaStatements.findFirst({
        where: and(
          eq(soaStatements.id, statementId),
          eq(soaStatements.userId, userId),
        ),
        with: { transactions: true },
      });

      if (!statement) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Statement not found",
        });
      }

      const targets = selectEligibleTransactions(
        statement.transactions as AiCategorizeTxRow[],
        scope,
      );

      return await categorizeTransactionRows(userId, targets, reporter);
    } catch (error) {
      if (reporter && error instanceof TRPCError) {
        await reporter.fail(error.message);
      } else if (reporter && error instanceof Error) {
        await reporter.fail(error.message);
      }
      throw error;
    }
  },

  async categorizePeriodWithAi(
    userId: string,
    periodId: string,
    scope: AiCategorizeScope,
    processId?: string,
  ): Promise<AiCategorizeResult> {
    await assertAiKeys(userId);

    let reporter: AiCategorizeProgressReporter | null = null;
    if (processId) {
      reporter = await AiCategorizeProgressReporter.create(userId, processId);
    }

    try {
      const period = await db.query.soaPeriods.findFirst({
        where: and(eq(soaPeriods.id, periodId), eq(soaPeriods.userId, userId)),
      });

      if (!period) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "SOA period not found",
        });
      }

      const statements = await db.query.soaStatements.findMany({
        where: statementsInPeriodWhere(
          userId,
          period.fromMonth,
          period.fromYear,
          period.toMonth,
          period.toYear,
        ),
        with: { transactions: true },
      });

      const allTransactions = statements.flatMap(
        (statement) => statement.transactions,
      ) as AiCategorizeTxRow[];

      const targets = selectEligibleTransactions(allTransactions, scope);

      return await categorizeTransactionRows(userId, targets, reporter);
    } catch (error) {
      if (reporter && error instanceof TRPCError) {
        await reporter.fail(error.message);
      } else if (reporter && error instanceof Error) {
        await reporter.fail(error.message);
      }
      throw error;
    }
  },
};
