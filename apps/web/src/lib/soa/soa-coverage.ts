import { normalizeCardLast4 } from "@/lib/due/normalize";

import type { CardCredential, SoaRow } from "./types";

/**
 * Cards whose issuer had at least one downloaded SOA PDF this period, but that
 * never ended up with a matching row — e.g. the shared-password PDF unlocked
 * for a different card, or the SOA text couldn't be resolved back to this
 * card's last-4. Without this check a card can silently vanish from a run even
 * though its bank "looks" fine overall (some PDF(s) were found).
 *
 * Cards whose issuer had no PDFs at all are intentionally excluded here — that
 * case is already covered by the bank-level "no SOA email this period"
 * placeholder.
 */
export function findMissingCards(
  cards: readonly CardCredential[],
  rows: readonly SoaRow[],
  banksWithPdf: ReadonlySet<string>,
): CardCredential[] {
  const coveredCardKeys = new Set(
    rows
      .filter((r) => !r.soaUnavailable && r.cardLast4 && r.cardLast4 !== "—")
      .map(
        (r) =>
          `${r.issuerId.toLowerCase()}\0${normalizeCardLast4(r.cardLast4)}`,
      ),
  );

  return cards.filter((card) => {
    const issuerId = card.issuer.toLowerCase();
    if (!banksWithPdf.has(issuerId)) return false;
    const key = `${issuerId}\0${normalizeCardLast4(card.last4)}`;
    return !coveredCardKeys.has(key);
  });
}
