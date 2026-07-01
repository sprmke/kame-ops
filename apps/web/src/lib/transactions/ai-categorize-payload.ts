import {
  CANNOT_ANALYZE_SLUG,
  extractMerchantKeyword,
} from "@/lib/transactions/categories";

export type AiCategorizeScope = "all" | "unknown_only";

export type AiCategorizeTxRow = {
  id: string;
  description: string;
  amount: string;
  categorySlug: string | null;
  categorySource: string | null;
};

export type MerchantGroup = {
  key: string;
  merchantId: string;
  sampleDescription: string;
  sampleAmount: string;
  transactionIds: string[];
};

export type AiMerchantAssignment = {
  merchantId: string;
  categorySlug?: string;
  newCategoryLabel?: string;
};

/** ~60 unique merchants per call keeps prompts small; duplicates expand to many tx rows. */
export const MERCHANT_BATCH_SIZE = 60;

function normalizeDescription(description: string): string {
  return description
    .replace(/^\(\d{1,2}\/\d{1,2}\)\s*/, "")
    .replace(/\s+/g, " ")
    .trim()
    .toUpperCase()
    .slice(0, 96);
}

export function merchantSignature(description: string): string {
  const keyword = extractMerchantKeyword(description);
  if (keyword && keyword.length >= 3) return keyword;
  return normalizeDescription(description);
}

export function isUnknownTransaction(tx: AiCategorizeTxRow): boolean {
  return (tx.categorySlug ?? CANNOT_ANALYZE_SLUG) === CANNOT_ANALYZE_SLUG;
}

export function selectEligibleTransactions(
  transactions: AiCategorizeTxRow[],
  scope: AiCategorizeScope,
): AiCategorizeTxRow[] {
  const eligible = transactions.filter((tx) => tx.categorySource !== "manual");
  if (scope === "unknown_only") {
    return eligible.filter(isUnknownTransaction);
  }
  return eligible;
}

export function groupTransactionsByMerchant(
  transactions: AiCategorizeTxRow[],
): MerchantGroup[] {
  const map = new Map<string, MerchantGroup>();

  for (const tx of transactions) {
    const key = merchantSignature(tx.description);
    const existing = map.get(key);
    if (existing) {
      existing.transactionIds.push(tx.id);
      continue;
    }
    map.set(key, {
      key,
      merchantId: "",
      sampleDescription: normalizeDescription(tx.description),
      sampleAmount: tx.amount.trim(),
      transactionIds: [tx.id],
    });
  }

  return [...map.values()].map((group, index) => ({
    ...group,
    merchantId: `m${index + 1}`,
  }));
}

type CompactPromptInput = {
  categorySlugs: string[];
  merchants: MerchantGroup[];
};

/** Token-minimal prompt: JSON in/out, one merchant row per unique merchant. */
export function buildCompactCategorizePrompt(
  input: CompactPromptInput,
): string {
  const payload = {
    cats: input.categorySlugs.filter((s) => s !== CANNOT_ANALYZE_SLUG),
    m: input.merchants.map((g) => [
      g.merchantId,
      g.sampleDescription.slice(0, 72),
      g.sampleAmount.replace(/[^\d.,()-]/g, "").slice(0, 16),
    ]),
  };

  return `Categorize PH credit card SOA merchants. Input JSON:
${JSON.stringify(payload)}

Reply JSON only: {"r":[["m1","slug_or_label"],...]}
- Use a cat slug from "cats" when it fits.
- Otherwise return a new 2-4 word Title Case label (not "unknown").
- payment_credit for payments/(CR); interest_fees for interest/late/finance charges.
- Every merchant id in "m" must appear once in "r".`;
}

type CompactAiResponse = {
  r?: Array<[string, string] | [string, string, string]>;
};

export function parseCompactCategorizeResponse(
  text: string,
): AiMerchantAssignment[] {
  const trimmed = text.trim();
  const jsonMatch = trimmed.match(/\{[\s\S]*\}/);
  if (!jsonMatch) return [];

  try {
    const parsed = JSON.parse(jsonMatch[0]) as CompactAiResponse;
    if (!Array.isArray(parsed.r)) return [];

    const results: AiMerchantAssignment[] = [];
    for (const row of parsed.r) {
      const merchantId = row[0]?.trim();
      const value = row[1]?.trim();
      if (!merchantId || !value) continue;

      const looksLikeSlug =
        !value.includes(" ") && /^[a-z][a-z0-9_]*$/i.test(value);

      if (looksLikeSlug) {
        results.push({ merchantId, categorySlug: value.toLowerCase() });
      } else {
        results.push({ merchantId, newCategoryLabel: value });
      }
    }
    return results;
  } catch {
    return [];
  }
}

export function expandMerchantAssignments(
  groups: MerchantGroup[],
  assignments: AiMerchantAssignment[],
): Map<string, AiMerchantAssignment> {
  const byMerchantId = new Map(assignments.map((row) => [row.merchantId, row]));
  const byTxId = new Map<string, AiMerchantAssignment>();

  for (const group of groups) {
    const assignment = byMerchantId.get(group.merchantId);
    if (!assignment) continue;
    for (const txId of group.transactionIds) {
      byTxId.set(txId, assignment);
    }
  }

  return byTxId;
}

export function countEligibleTransactions(
  transactions: Array<{
    categorySlug?: string | null;
    categorySource?: string | null;
  }>,
): {
  allEligibleCount: number;
  unknownCount: number;
} {
  const eligible = transactions.filter((tx) => tx.categorySource !== "manual");
  return {
    allEligibleCount: eligible.length,
    unknownCount: eligible.filter((tx) =>
      isUnknownTransaction(tx as AiCategorizeTxRow),
    ).length,
  };
}

export function isLikelySystemCategory(slug: string): boolean {
  return slug === "payment_credit" || slug === "interest_fees";
}
