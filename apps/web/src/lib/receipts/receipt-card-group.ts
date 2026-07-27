import type {
  CreditCardReceiptAiResult,
  ReceiptKnownCard,
} from "@/lib/receipts/types";

export type KnownCardForGrouping = ReceiptKnownCard;

export type ReceiptCardGroup = {
  key: string;
  label: string;
};

export function receiptCardGroupFromAi(
  ai: CreditCardReceiptAiResult,
  knownCards: KnownCardForGrouping[],
  opts?: {
    forcedDueEntryId?: string;
    forcedLabel?: string;
    fallbackKey?: string;
  },
): ReceiptCardGroup {
  if (opts?.forcedDueEntryId) {
    return {
      key: `due:${opts.forcedDueEntryId}`,
      label: opts.forcedLabel ?? "Selected card",
    };
  }

  const last4 = ai.extraction.cardLast4?.trim();
  if (!last4) {
    return {
      key: opts?.fallbackKey ?? `unknown:${crypto.randomUUID()}`,
      label: "Unknown card",
    };
  }

  const match = knownCards.find((card) => card.last4 === last4);
  const issuer = match?.issuerId ?? ai.extraction.bankOrWallet ?? "card";
  const label =
    match?.displayLabel ??
    (match?.bankLabel ? `${match.bankLabel} ·••• ${last4}` : null) ??
    (ai.extraction.bankOrWallet
      ? `${ai.extraction.bankOrWallet} ·••• ${last4}`
      : `Card ·••• ${last4}`);

  return {
    key: `card:${issuer}:${last4}`,
    label,
  };
}

export type BatchUploadItemInput = {
  storagePath: string;
  originalFileName?: string;
};

export type AnalyzedBatchItem = BatchUploadItemInput & {
  ai: CreditCardReceiptAiResult;
};

export type AnalyzedBatchGroup = {
  key: string;
  label: string;
  items: AnalyzedBatchItem[];
};

export function groupAnalyzedBatchItems(
  items: AnalyzedBatchItem[],
  knownCards: KnownCardForGrouping[],
  opts?: { forcedDueEntryId?: string; forcedLabel?: string },
): AnalyzedBatchGroup[] {
  const map = new Map<string, AnalyzedBatchGroup>();

  for (const item of items) {
    const group = receiptCardGroupFromAi(item.ai, knownCards, {
      forcedDueEntryId: opts?.forcedDueEntryId,
      forcedLabel: opts?.forcedLabel,
      fallbackKey: `unknown:${item.storagePath}`,
    });

    const existing = map.get(group.key);
    if (existing) {
      existing.items.push(item);
      continue;
    }

    map.set(group.key, {
      key: group.key,
      label: group.label,
      items: [item],
    });
  }

  return [...map.values()];
}
