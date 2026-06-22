import { and, desc, eq } from "drizzle-orm";

import { db } from "@/lib/db";
import {
  soaStatements,
  soaTransactions,
  transactionCategoryRules,
} from "@/lib/db/schema";
import {
  BUILTIN_CATEGORY_RULES,
  CANNOT_ANALYZE_SLUG,
  categoryLabel,
  type CategorySource,
  extractMerchantKeyword,
  isValidCategorySlug,
  normalizeKeyword,
  type TransactionCategorySlug,
} from "@/lib/transactions/categories";

type RuleRow = typeof transactionCategoryRules.$inferSelect;

type TxInput = {
  id?: string;
  description: string;
  amount: string;
  categorySlug?: string | null;
  categorySource?: string | null;
};

export type CategorizedTransaction = TxInput & {
  categorySlug: TransactionCategorySlug;
  categorySource: CategorySource;
  categoryLabel: string;
};

function isCreditAmount(amount: string): boolean {
  return /\(CR\)/i.test(amount) || amount.trim().startsWith("-");
}

function systemCategoryFromKind(
  description: string,
  amount: string,
): TransactionCategorySlug | null {
  if (isCreditAmount(amount)) return "payment_credit";
  if (/interest\s+charge/i.test(description)) return "interest_fees";
  if (
    /\b(fee|annual fee|late charge|finance charge|service charge)\b/i.test(
      description,
    )
  ) {
    return "interest_fees";
  }
  if (/payment|paid/i.test(description)) return "payment_credit";
  return null;
}

function matchKeyword(description: string, keyword: string): boolean {
  return description.toUpperCase().includes(normalizeKeyword(keyword));
}

function resolveFromRules(
  description: string,
  amount: string,
  userRules: RuleRow[],
): { slug: TransactionCategorySlug; source: CategorySource } | null {
  const sorted = [...userRules].sort(
    (a, b) =>
      b.priority - a.priority || b.updatedAt.getTime() - a.updatedAt.getTime(),
  );

  for (const rule of sorted) {
    if (!isValidCategorySlug(rule.categorySlug)) continue;
    if (matchKeyword(description, rule.keyword)) {
      return { slug: rule.categorySlug, source: "rule" };
    }
  }

  const builtin = [...BUILTIN_CATEGORY_RULES].sort(
    (a, b) => (b.priority ?? 0) - (a.priority ?? 0),
  );
  for (const rule of builtin) {
    if (matchKeyword(description, rule.keyword)) {
      return { slug: rule.categorySlug, source: "builtin" };
    }
  }

  const system = systemCategoryFromKind(description, amount);
  if (system) return { slug: system, source: "system" };

  return null;
}

export function categorizeTransaction(
  tx: TxInput,
  userRules: RuleRow[],
): CategorizedTransaction {
  if (
    tx.categorySource === "manual" &&
    tx.categorySlug &&
    isValidCategorySlug(tx.categorySlug)
  ) {
    return {
      ...tx,
      categorySlug: tx.categorySlug,
      categorySource: "manual",
      categoryLabel: categoryLabel(tx.categorySlug),
    };
  }

  const matched = resolveFromRules(tx.description, tx.amount, userRules);
  const slug = matched?.slug ?? CANNOT_ANALYZE_SLUG;
  const source: CategorySource =
    slug === CANNOT_ANALYZE_SLUG ? "system" : matched!.source;

  return {
    ...tx,
    categorySlug: slug,
    categorySource: source,
    categoryLabel: categoryLabel(slug),
  };
}

export const transactionCategoryService = {
  async listRules(userId: string) {
    return db.query.transactionCategoryRules.findMany({
      where: eq(transactionCategoryRules.userId, userId),
      orderBy: [
        desc(transactionCategoryRules.priority),
        desc(transactionCategoryRules.updatedAt),
      ],
    });
  },

  async getRulesForUser(userId: string) {
    return this.listRules(userId);
  },

  async createRule(
    userId: string,
    input: {
      keyword: string;
      categorySlug: TransactionCategorySlug;
      priority?: number;
      source?: "user" | "learned";
    },
  ) {
    const keyword = normalizeKeyword(input.keyword);
    if (!keyword) throw new Error("Keyword is required");
    if (!isValidCategorySlug(input.categorySlug)) {
      throw new Error("Invalid category");
    }

    const existing = await db.query.transactionCategoryRules.findFirst({
      where: and(
        eq(transactionCategoryRules.userId, userId),
        eq(transactionCategoryRules.keyword, keyword),
      ),
    });

    if (existing) {
      const [updated] = await db
        .update(transactionCategoryRules)
        .set({
          categorySlug: input.categorySlug,
          priority: input.priority ?? existing.priority,
          source: input.source ?? existing.source,
        })
        .where(eq(transactionCategoryRules.id, existing.id))
        .returning();
      return updated!;
    }

    const [created] = await db
      .insert(transactionCategoryRules)
      .values({
        userId,
        keyword,
        categorySlug: input.categorySlug,
        priority: input.priority ?? 0,
        source: input.source ?? "user",
      })
      .returning();
    return created!;
  },

  async updateRule(
    userId: string,
    ruleId: string,
    input: {
      keyword?: string;
      categorySlug?: TransactionCategorySlug;
      priority?: number;
    },
  ) {
    const keyword = input.keyword ? normalizeKeyword(input.keyword) : undefined;
    if (input.categorySlug && !isValidCategorySlug(input.categorySlug)) {
      throw new Error("Invalid category");
    }

    const [updated] = await db
      .update(transactionCategoryRules)
      .set({
        ...(keyword ? { keyword } : {}),
        ...(input.categorySlug ? { categorySlug: input.categorySlug } : {}),
        ...(input.priority !== undefined ? { priority: input.priority } : {}),
      })
      .where(
        and(
          eq(transactionCategoryRules.id, ruleId),
          eq(transactionCategoryRules.userId, userId),
        ),
      )
      .returning();
    return updated ?? null;
  },

  async deleteRule(userId: string, ruleId: string) {
    const [deleted] = await db
      .delete(transactionCategoryRules)
      .where(
        and(
          eq(transactionCategoryRules.id, ruleId),
          eq(transactionCategoryRules.userId, userId),
        ),
      )
      .returning();
    return deleted ?? null;
  },

  categorizeMany(
    transactions: TxInput[],
    userRules: RuleRow[],
  ): CategorizedTransaction[] {
    return transactions.map((tx) => categorizeTransaction(tx, userRules));
  },

  async enrichTransactions<T extends TxInput>(
    userId: string,
    transactions: T[],
  ): Promise<(T & CategorizedTransaction)[]> {
    const rules = await this.getRulesForUser(userId);
    return transactions.map((tx) => ({
      ...tx,
      ...categorizeTransaction(tx, rules),
    }));
  },

  async updateTransactionCategory(
    userId: string,
    transactionId: string,
    input: {
      categorySlug: TransactionCategorySlug;
      learn?: boolean;
    },
  ) {
    if (!isValidCategorySlug(input.categorySlug)) {
      throw new Error("Invalid category");
    }

    const tx = await db.query.soaTransactions.findFirst({
      where: eq(soaTransactions.id, transactionId),
      with: { statement: true },
    });
    if (!tx?.statement || tx.statement.userId !== userId) {
      throw new Error("Transaction not found");
    }

    const [updated] = await db
      .update(soaTransactions)
      .set({
        categorySlug: input.categorySlug,
        categorySource: "manual",
      })
      .where(eq(soaTransactions.id, transactionId))
      .returning();

    if (input.learn !== false) {
      const keyword = extractMerchantKeyword(tx.description);
      if (keyword) {
        await this.createRule(userId, {
          keyword,
          categorySlug: input.categorySlug,
          priority: 50,
          source: "learned",
        });
      }
    }

    return {
      ...updated!,
      categoryLabel: categoryLabel(input.categorySlug),
    };
  },

  async recategorizeStatement(userId: string, statementId: string) {
    const statement = await db.query.soaStatements.findFirst({
      where: and(
        eq(soaStatements.id, statementId),
        eq(soaStatements.userId, userId),
      ),
      with: { transactions: true },
    });
    if (!statement) return { updated: 0 };

    const rules = await this.getRulesForUser(userId);
    let updated = 0;

    for (const tx of statement.transactions) {
      if (tx.categorySource === "manual") continue;
      const result = categorizeTransaction(tx, rules);
      if (
        result.categorySlug !== tx.categorySlug ||
        result.categorySource !== tx.categorySource
      ) {
        await db
          .update(soaTransactions)
          .set({
            categorySlug: result.categorySlug,
            categorySource: result.categorySource,
          })
          .where(eq(soaTransactions.id, tx.id));
        updated++;
      }
    }

    return { updated };
  },
};
