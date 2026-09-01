import { and, desc, eq } from "drizzle-orm";

import { db } from "@/lib/db";
import {
  soaStatements,
  soaTransactions,
  transactionCategoryRules,
  userTransactionCategories,
} from "@/lib/db/schema";
import { cachedPerRequest } from "@/server/lib/request-cache";
import {
  BUILTIN_CATEGORY_RULES,
  CANNOT_ANALYZE_SLUG,
  categoryLabel,
  isKnownCategorySlug,
  isValidCategorySlug,
  slugifyUserCategoryLabel,
  TRANSACTION_CATEGORY_OPTIONS,
  type CategorySource,
  extractMerchantKeyword,
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
  customSlugs?: ReadonlySet<string>,
): { slug: string; source: CategorySource } | null {
  const sorted = [...userRules].sort(
    (a, b) =>
      b.priority - a.priority || b.updatedAt.getTime() - a.updatedAt.getTime(),
  );

  for (const rule of sorted) {
    if (!isKnownCategorySlug(rule.categorySlug, customSlugs)) continue;
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

function isAllowedCategorySlugForUser(
  slug: string,
  customSlugs?: ReadonlySet<string>,
): boolean {
  return isValidCategorySlug(slug) || Boolean(customSlugs?.has(slug));
}

export function categorizeTransaction(
  tx: TxInput,
  userRules: RuleRow[],
  customSlugs?: ReadonlySet<string>,
): CategorizedTransaction {
  if (
    tx.categorySource === "manual" &&
    tx.categorySlug &&
    isAllowedCategorySlugForUser(tx.categorySlug, customSlugs)
  ) {
    return {
      ...tx,
      categorySlug: tx.categorySlug as TransactionCategorySlug,
      categorySource: "manual",
      categoryLabel: categoryLabel(tx.categorySlug),
    };
  }

  const matched = resolveFromRules(
    tx.description,
    tx.amount,
    userRules,
    customSlugs,
  );
  const slug = matched?.slug ?? CANNOT_ANALYZE_SLUG;
  const source: CategorySource =
    slug === CANNOT_ANALYZE_SLUG ? "system" : matched!.source;

  return {
    ...tx,
    categorySlug: slug as TransactionCategorySlug,
    categorySource: source,
    categoryLabel: categoryLabel(slug),
  };
}

function listUserCategoryRows(userId: string) {
  return db.query.userTransactionCategories.findMany({
    where: eq(userTransactionCategories.userId, userId),
    orderBy: (t, { asc }) => [asc(t.label)],
  });
}

/** Reads on the hot categorization path — deduped for the life of one request. */
const cachedRulesForUser = cachedPerRequest(
  "transactionCategory.rules",
  (userId: string): Promise<RuleRow[]> =>
    db.query.transactionCategoryRules.findMany({
      where: eq(transactionCategoryRules.userId, userId),
      orderBy: [
        desc(transactionCategoryRules.priority),
        desc(transactionCategoryRules.updatedAt),
      ],
    }),
);

const cachedCustomLabelMap = cachedPerRequest(
  "transactionCategory.customLabels",
  async (userId: string): Promise<Map<string, string>> => {
    const rows = await listUserCategoryRows(userId);
    return new Map(rows.map((row) => [row.slug, row.label]));
  },
);

export const transactionCategoryService = {
  async listUserCategories(userId: string) {
    return listUserCategoryRows(userId);
  },

  async listOptions(userId: string) {
    const custom = await this.listUserCategories(userId);
    const builtIn = TRANSACTION_CATEGORY_OPTIONS.filter(
      (opt) => opt.slug !== CANNOT_ANALYZE_SLUG,
    );
    const unknown = TRANSACTION_CATEGORY_OPTIONS.find(
      (opt) => opt.slug === CANNOT_ANALYZE_SLUG,
    );
    return [
      ...builtIn.map((opt) => ({ ...opt, isCustom: false as const })),
      ...custom.map((row) => ({
        slug: row.slug,
        label: row.label,
        isCustom: true as const,
      })),
      ...(unknown ? [{ ...unknown, isCustom: false as const }] : []),
    ];
  },

  async createCategory(userId: string, label: string) {
    return this.ensureUserCategory(userId, label);
  },

  async deleteCategory(userId: string, slug: string) {
    if (isValidCategorySlug(slug)) {
      throw new Error("Built-in categories cannot be deleted");
    }

    const row = await db.query.userTransactionCategories.findFirst({
      where: and(
        eq(userTransactionCategories.userId, userId),
        eq(userTransactionCategories.slug, slug),
      ),
    });
    if (!row) throw new Error("Category not found");

    await db
      .delete(transactionCategoryRules)
      .where(
        and(
          eq(transactionCategoryRules.userId, userId),
          eq(transactionCategoryRules.categorySlug, slug),
        ),
      );

    await db
      .delete(userTransactionCategories)
      .where(
        and(
          eq(userTransactionCategories.userId, userId),
          eq(userTransactionCategories.slug, slug),
        ),
      );

    return row;
  },

  async ensureUserCategory(userId: string, label: string) {
    const trimmed = label.trim().slice(0, 64);
    if (trimmed.length < 2) {
      throw new Error("Category label is too short");
    }

    const existingByLabel = await db.query.userTransactionCategories.findFirst({
      where: and(
        eq(userTransactionCategories.userId, userId),
        eq(userTransactionCategories.label, trimmed),
      ),
    });
    if (existingByLabel) return existingByLabel;

    let baseSlug = slugifyUserCategoryLabel(trimmed);
    let slug = baseSlug;
    let attempt = 0;
    while (attempt < 20) {
      if (
        !isValidCategorySlug(slug) &&
        !(await db.query.userTransactionCategories.findFirst({
          where: and(
            eq(userTransactionCategories.userId, userId),
            eq(userTransactionCategories.slug, slug),
          ),
        }))
      ) {
        break;
      }
      attempt += 1;
      slug = `${baseSlug.slice(0, 28)}_${attempt}`;
    }

    const [created] = await db
      .insert(userTransactionCategories)
      .values({
        userId,
        slug,
        label: trimmed,
      })
      .returning();
    return created!;
  },

  async isAllowedCategorySlug(userId: string, slug: string) {
    if (isValidCategorySlug(slug)) return true;
    const custom = await db.query.userTransactionCategories.findFirst({
      where: and(
        eq(userTransactionCategories.userId, userId),
        eq(userTransactionCategories.slug, slug),
      ),
    });
    return Boolean(custom);
  },

  getCustomLabelMap(userId: string): Promise<Map<string, string>> {
    return cachedCustomLabelMap(userId);
  },

  async listRules(userId: string): Promise<RuleRow[]> {
    return cachedRulesForUser(userId);
  },

  getRulesForUser(userId: string): Promise<RuleRow[]> {
    return cachedRulesForUser(userId);
  },

  async createRule(
    userId: string,
    input: {
      keyword: string;
      categorySlug: string;
      priority?: number;
      source?: "user" | "learned";
    },
  ) {
    const keyword = normalizeKeyword(input.keyword);
    if (!keyword) throw new Error("Keyword is required");
    if (!isValidCategorySlug(input.categorySlug)) {
      const allowed = await this.isAllowedCategorySlug(
        userId,
        input.categorySlug,
      );
      if (!allowed) throw new Error("Invalid category");
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
      categorySlug?: string;
      priority?: number;
    },
  ) {
    const keyword = input.keyword ? normalizeKeyword(input.keyword) : undefined;
    if (input.categorySlug && !isValidCategorySlug(input.categorySlug)) {
      const allowed = await this.isAllowedCategorySlug(
        userId,
        input.categorySlug,
      );
      if (!allowed) throw new Error("Invalid category");
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
    customSlugs?: ReadonlySet<string>,
  ): CategorizedTransaction[] {
    return transactions.map((tx) =>
      categorizeTransaction(tx, userRules, customSlugs),
    );
  },

  async enrichTransactions<T extends TxInput>(
    userId: string,
    transactions: T[],
  ): Promise<(T & CategorizedTransaction)[]> {
    const [rules, customLabels] = await Promise.all([
      this.getRulesForUser(userId),
      this.getCustomLabelMap(userId),
    ]);
    const customSlugs = new Set(customLabels.keys());
    return transactions.map((tx) => {
      const categorized = categorizeTransaction(tx, rules, customSlugs);
      return {
        ...tx,
        ...categorized,
        categoryLabel: categoryLabel(categorized.categorySlug, customLabels),
      };
    });
  },

  async updateTransactionCategory(
    userId: string,
    transactionId: string,
    input: {
      categorySlug: string;
      learn?: boolean;
    },
  ) {
    if (!isValidCategorySlug(input.categorySlug)) {
      const allowed = await this.isAllowedCategorySlug(
        userId,
        input.categorySlug,
      );
      if (!allowed) throw new Error("Invalid category");
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
      categoryLabel: categoryLabel(
        input.categorySlug,
        await this.getCustomLabelMap(userId),
      ),
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
    const customLabels = await this.getCustomLabelMap(userId);
    const customSlugs = new Set(customLabels.keys());
    let updated = 0;

    for (const tx of statement.transactions) {
      if (tx.categorySource === "manual") continue;
      const result = categorizeTransaction(tx, rules, customSlugs);
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
