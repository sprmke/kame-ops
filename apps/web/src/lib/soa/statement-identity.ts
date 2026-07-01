/** Fields that identify one persisted SOA statement row for a user + period. */
export type SoaStatementIdentity = {
  issuerId: string;
  cardLast4: string;
  statementMonth: number;
  statementYear: number;
  sourceMessageId?: string | null;
  pdfFileName?: string | null;
};

export function soaStatementSourceKey(row: {
  sourceMessageId?: string | null;
  pdfFileName?: string | null;
}): string | null {
  const messageId = row.sourceMessageId?.trim();
  if (messageId && messageId !== "—") return `msg:${messageId}`;

  const pdfFileName = row.pdfFileName?.trim();
  if (pdfFileName && pdfFileName !== "—") return `pdf:${pdfFileName}`;

  return null;
}

export function soaStatementIdentityKey(row: SoaStatementIdentity): string {
  const source = soaStatementSourceKey(row);
  return [
    row.issuerId.toLowerCase(),
    row.cardLast4,
    row.statementYear,
    row.statementMonth,
    source ?? "",
  ].join(":");
}
