/** Normalize card last-4 to exactly four digits. */
export function normalizeCardLast4(last4: string): string {
  const digits = String(last4 ?? "").replace(/\D/g, "");
  if (digits.length >= 4) return digits.slice(-4);
  return digits.padStart(4, "0");
}

export function dueEntryKey(issuerId: string, cardLast4: string): string {
  return `${issuerId.trim().toLowerCase()}:${normalizeCardLast4(cardLast4)}`;
}
