export const TRANSACTION_CATEGORIES = {
  store_shopping: "Store shopping",
  online_shopping: "Online shopping",
  dining: "Dining",
  groceries: "Groceries",
  bills_payment: "Bills payment",
  transport: "Transport",
  entertainment: "Entertainment",
  subscriptions: "Subscriptions",
  health: "Health & wellness",
  travel: "Travel",
  business: "Business",
  investments: "Investments",
  interest_fees: "Interest & fees",
  payment_credit: "Payment / credit",
  other: "Other",
  unknown: "Cannot analyze",
} as const;

export type TransactionCategorySlug = keyof typeof TRANSACTION_CATEGORIES;

export const TRANSACTION_CATEGORY_SLUGS = Object.keys(
  TRANSACTION_CATEGORIES,
) as TransactionCategorySlug[];

export const TRANSACTION_CATEGORY_OPTIONS = (
  Object.entries(TRANSACTION_CATEGORIES) as [TransactionCategorySlug, string][]
).map(([slug, label]) => ({ slug, label }));

export const CANNOT_ANALYZE_SLUG: TransactionCategorySlug = "unknown";

export type CategorySource = "manual" | "rule" | "system" | "builtin";

export type CategoryRule = {
  keyword: string;
  categorySlug: TransactionCategorySlug;
  priority?: number;
};

/** Built-in keyword rules — lowest priority after user rules. */
export const BUILTIN_CATEGORY_RULES: CategoryRule[] = [
  { keyword: "SHOPEE", categorySlug: "online_shopping", priority: 10 },
  { keyword: "LAZADA", categorySlug: "online_shopping", priority: 10 },
  { keyword: "ZALORA", categorySlug: "online_shopping", priority: 10 },
  { keyword: "TOKOPEDIA", categorySlug: "online_shopping", priority: 10 },
  { keyword: "BURGER KING", categorySlug: "dining", priority: 10 },
  { keyword: "MCDONALD", categorySlug: "dining", priority: 10 },
  { keyword: "JOLLIBEE", categorySlug: "dining", priority: 10 },
  { keyword: "KFC", categorySlug: "dining", priority: 10 },
  { keyword: "STARBUCKS", categorySlug: "dining", priority: 10 },
  { keyword: "COFFEE", categorySlug: "dining", priority: 5 },
  { keyword: "RESTAURANT", categorySlug: "dining", priority: 8 },
  { keyword: "DINING", categorySlug: "dining", priority: 8 },
  { keyword: "GRAB FOOD", categorySlug: "dining", priority: 12 },
  { keyword: "FOODPANDA", categorySlug: "dining", priority: 12 },
  { keyword: "SM STORE", categorySlug: "store_shopping", priority: 12 },
  { keyword: "ROBINSONS", categorySlug: "store_shopping", priority: 10 },
  { keyword: "DEPARTMENT STORE", categorySlug: "store_shopping", priority: 10 },
  { keyword: "SM SUPERMARKET", categorySlug: "groceries", priority: 12 },
  { keyword: "PUREGOLD", categorySlug: "groceries", priority: 10 },
  { keyword: "S&R", categorySlug: "groceries", priority: 10 },
  { keyword: "MART", categorySlug: "groceries", priority: 6 },
  { keyword: "GRAB", categorySlug: "transport", priority: 8 },
  { keyword: "ANGKAS", categorySlug: "transport", priority: 10 },
  { keyword: "BEEP", categorySlug: "transport", priority: 8 },
  { keyword: "MERALCO", categorySlug: "bills_payment", priority: 12 },
  { keyword: "PLDT", categorySlug: "bills_payment", priority: 12 },
  { keyword: "GLOBE", categorySlug: "bills_payment", priority: 10 },
  { keyword: "CONVERGE", categorySlug: "bills_payment", priority: 10 },
  { keyword: "APPLE.COM/BILL", categorySlug: "subscriptions", priority: 14 },
  { keyword: "ITUNES", categorySlug: "subscriptions", priority: 14 },
  { keyword: "APPLE.COM", categorySlug: "subscriptions", priority: 12 },
  { keyword: "NETFLIX", categorySlug: "subscriptions", priority: 12 },
  { keyword: "SPOTIFY", categorySlug: "subscriptions", priority: 12 },
  { keyword: "YOUTUBE", categorySlug: "subscriptions", priority: 10 },
  { keyword: "DISNEY", categorySlug: "subscriptions", priority: 10 },
  { keyword: "GOOGLE ONE", categorySlug: "subscriptions", priority: 10 },
  { keyword: "CINEMA", categorySlug: "entertainment", priority: 10 },
  { keyword: "WATSONS", categorySlug: "health", priority: 10 },
  { keyword: "MERCURY", categorySlug: "health", priority: 10 },
  { keyword: "CEBU PAC", categorySlug: "travel", priority: 10 },
  { keyword: "AIRASIA", categorySlug: "travel", priority: 10 },
  { keyword: "BOOKING.COM", categorySlug: "travel", priority: 10 },
  { keyword: "AGODA", categorySlug: "travel", priority: 10 },
  { keyword: "CASH PAYMENT", categorySlug: "payment_credit", priority: 20 },
  { keyword: "PAYMENT", categorySlug: "payment_credit", priority: 5 },
  { keyword: "INTEREST CHARGE", categorySlug: "interest_fees", priority: 20 },
];

export function categoryLabel(
  slug: TransactionCategorySlug | null | undefined,
) {
  if (!slug) return TRANSACTION_CATEGORIES.unknown;
  return TRANSACTION_CATEGORIES[slug] ?? TRANSACTION_CATEGORIES.unknown;
}

/** Merchant token from description for learned rules (text before first comma). */
export function extractMerchantKeyword(description: string): string | null {
  const cleaned = description.replace(/^\(\d{1,2}\/\d{1,2}\)\s*/, "").trim();
  const head = cleaned.split(",")[0]?.trim() ?? cleaned;
  const normalized = head.replace(/\s+/g, " ").toUpperCase();
  if (normalized.length < 3) return null;
  return normalized.slice(0, 128);
}

export function normalizeKeyword(keyword: string): string {
  return keyword.trim().toUpperCase().slice(0, 128);
}

export function isValidCategorySlug(
  slug: string,
): slug is TransactionCategorySlug {
  return slug in TRANSACTION_CATEGORIES;
}
