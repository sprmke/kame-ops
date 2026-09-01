import { normalizeCardLast4 } from "@/lib/due/normalize";
import { resolveCardLast4FromSoaText } from "@/lib/soa/card-last4-from-text";
import { normalizeSoaDisplayDate } from "@/lib/soa/calendar-month";
import {
  bankLabelForIssuer,
  detectIssuerFromSoaText,
  parseIssuerId,
} from "@/lib/soa/detect-issuer";
import type { CardCredential, SoaRow, TransactionLine } from "@/lib/soa/types";

export type SoaAiExtractFields = {
  issuerId: string | null;
  cardLast4: string | null;
  statementDate: string | null;
  dueDate: string | null;
  minimumDue: string | null;
  totalDue: string | null;
  transactions: TransactionLine[];
};

export function isBlankSoaField(value: string | null | undefined): boolean {
  const t = (value ?? "").trim();
  return !t || t === "—";
}

/** True only when last-4 is a real 4-digit value on one of the user's cards. */
export function last4MatchesKnownCard(
  last4: string,
  cards: { last4: string }[],
): boolean {
  const digits = String(last4 ?? "").replace(/\D/g, "");
  if (digits.length < 4) return false;
  const norm = digits.slice(-4);
  return cards.some((c) => normalizeCardLast4(c.last4) === norm);
}

export function mergeAiIntoSoaRow(
  row: SoaRow,
  ai: SoaAiExtractFields | null,
): SoaRow {
  if (!ai) return row;
  const next = { ...row };
  if (isBlankSoaField(next.statementDate) && ai.statementDate) {
    next.statementDate = ai.statementDate;
  }
  if (isBlankSoaField(next.dueDate) && ai.dueDate) {
    next.dueDate = ai.dueDate;
  }
  if (isBlankSoaField(next.minimumDue) && ai.minimumDue) {
    next.minimumDue = ai.minimumDue;
  }
  if (isBlankSoaField(next.totalDue) && ai.totalDue) {
    next.totalDue = ai.totalDue;
  }
  if (
    (!next.transactions || next.transactions.length === 0) &&
    ai.transactions.length
  ) {
    next.transactions = ai.transactions;
  }
  if (isBlankSoaField(next.cardLast4) && ai.cardLast4) {
    next.cardLast4 = ai.cardLast4;
  }
  return next;
}

export function soaRowNeedsAiFill(row: SoaRow): boolean {
  const missing =
    Number(isBlankSoaField(row.minimumDue)) +
    Number(isBlankSoaField(row.totalDue)) +
    Number(isBlankSoaField(row.statementDate)) +
    Number(isBlankSoaField(row.dueDate));
  return missing >= 2 || !row.transactions?.length;
}

export function resolveIssuerAndLast4(input: {
  text: string;
  cards: CardCredential[];
  unlockLast4: string;
  ai: SoaAiExtractFields | null;
}): { issuerId: string; last4: string } {
  const { text, cards, ai } = input;
  const known = cards.map((c) => ({
    last4: c.last4,
    fullPan: c.fullPan,
    label: c.label,
  }));

  const unlockIsKnown = last4MatchesKnownCard(input.unlockLast4, cards);
  const textLast4 = resolveCardLast4FromSoaText(
    text,
    known,
    unlockIsKnown ? input.unlockLast4 : "0000",
  );
  const candidates = [
    textLast4,
    ai?.cardLast4,
    unlockIsKnown ? input.unlockLast4 : null,
  ];
  const last4Raw = candidates.find((v) => v && last4MatchesKnownCard(v, cards));
  const last4 = last4Raw ? normalizeCardLast4(last4Raw) : "";

  const matchingCards = last4
    ? cards.filter((c) => normalizeCardLast4(c.last4) === last4)
    : [];
  if (matchingCards.length === 1) {
    return { issuerId: matchingCards[0]!.issuer.toLowerCase(), last4 };
  }

  const detected =
    detectIssuerFromSoaText(text) ??
    ai?.issuerId ??
    matchingCards[0]?.issuer ??
    null;

  if (detected && last4) {
    return { issuerId: detected.toLowerCase(), last4 };
  }

  return {
    issuerId: matchingCards[0]?.issuer.toLowerCase() ?? "",
    last4,
  };
}

export function applyMatchedCardMeta(
  row: SoaRow,
  cards: CardCredential[],
): SoaRow {
  const matched = cards.find(
    (c) =>
      c.issuer.toLowerCase() === row.issuerId.toLowerCase() &&
      normalizeCardLast4(c.last4) === normalizeCardLast4(row.cardLast4),
  );
  if (!matched) return row;
  return {
    ...row,
    bankLabel: bankLabelForIssuer(row.issuerId),
    cardDisplayLabel: matched.label?.trim() || row.cardDisplayLabel,
    fullPan: matched.fullPan?.trim() || row.fullPan,
    contactLine: matched.contactLine?.trim() || row.contactLine,
  };
}

export function identityIsAssignedToKnownCard(
  issuerId: string,
  last4: string,
  cards: CardCredential[],
): boolean {
  const issuer = parseIssuerId(issuerId);
  if (!issuer || !last4MatchesKnownCard(last4, cards)) return false;
  return cards.some(
    (c) =>
      c.issuer.toLowerCase() === issuer &&
      normalizeCardLast4(c.last4) === normalizeCardLast4(last4),
  );
}

export function normalizeSoaRowDates(row: SoaRow): SoaRow {
  return {
    ...row,
    statementDate: normalizeSoaDisplayDate(row.statementDate),
    dueDate: normalizeSoaDisplayDate(row.dueDate),
  };
}
