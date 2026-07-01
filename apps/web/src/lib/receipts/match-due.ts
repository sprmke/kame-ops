export type ReceiptDueMatchInput = {
  dueEntryId?: string | null;
  parsedCardLast4: string | null;
  dueDateYmd?: string | null;
  aiAnalysis?: { paymentDate?: string } | null;
  createdAt: Date | string;
};

export type DueMatchCandidate = {
  id: string;
  issuerId: string;
  cardLast4: string;
  dueDateYmd: string;
  statementPeriodKey: string;
  statementPeriodLabel: string;
};

/** Match a receipt to an enriched due entry (same rules as receipt list on the server). */
export function matchReceiptToDue(
  dues: DueMatchCandidate[],
  receipt: ReceiptDueMatchInput,
): DueMatchCandidate | undefined {
  if (receipt.dueEntryId) {
    const byId = dues.find((due) => due.id === receipt.dueEntryId);
    if (byId) return byId;
  }

  if (!receipt.parsedCardLast4) return undefined;

  if (receipt.dueDateYmd) {
    const exact = dues.find(
      (due) =>
        due.cardLast4 === receipt.parsedCardLast4 &&
        due.dueDateYmd === receipt.dueDateYmd,
    );
    if (exact) return exact;
  }

  const createdAt =
    typeof receipt.createdAt === "string"
      ? receipt.createdAt
      : receipt.createdAt.toISOString();
  const monthYm =
    receipt.aiAnalysis?.paymentDate?.slice(0, 7) ?? createdAt.slice(0, 7);

  const byMonth = dues.find(
    (due) =>
      due.cardLast4 === receipt.parsedCardLast4 &&
      due.dueDateYmd.startsWith(monthYm),
  );
  if (byMonth) return byMonth;

  const forCard = dues.filter(
    (due) => due.cardLast4 === receipt.parsedCardLast4,
  );
  return forCard.length > 0 ? forCard[forCard.length - 1] : undefined;
}

export function resolveStatementPeriodFromDue(
  due: Pick<DueMatchCandidate, "statementPeriodKey" | "statementPeriodLabel">,
): { key: string; label: string } {
  return {
    key: due.statementPeriodKey,
    label: due.statementPeriodLabel,
  };
}
