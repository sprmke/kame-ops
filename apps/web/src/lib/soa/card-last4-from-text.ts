import { normalizeCardLast4 } from "@/lib/due/normalize";

export type KnownCardForLast4 = {
  last4: string;
  fullPan?: string;
  label?: string;
};

/** Candidate card last-4 values found in SOA plain text. */
export function extractCardLast4Candidates(text: string): string[] {
  const flat = text.replace(/\s+/g, " ");
  const found = new Set<string>();

  const panRe = /(?:\d{4}[\s-]?){3}(\d{4})\b/g;
  let m: RegExpExecArray | null;
  while ((m = panRe.exec(flat)) !== null) {
    found.add(normalizeCardLast4(m[1]!));
  }

  const maskedRe =
    /(?:X{2,4}[\s-]?){2,3}X{2,4}[\s-]?(\d{4})\b|(?:\*{2,}[\s-]?){3}\*{2,}[\s-]?(\d{4})\b/gi;
  while ((m = maskedRe.exec(flat)) !== null) {
    const digits = m[1] ?? m[2];
    if (digits) found.add(normalizeCardLast4(digits));
  }

  const endingRe =
    /(?:ending|last\s+4|card\s+(?:no\.?|number))\s*[:\s]*(?:\*{2,}\s*)?(\d{4})\b/gi;
  while ((m = endingRe.exec(flat)) !== null) {
    found.add(normalizeCardLast4(m[1]!));
  }

  return [...found];
}

function firstKnownLast4InText(
  text: string,
  candidates: string[],
  knownLast4s: string[],
): string | null {
  const known = new Set(knownLast4s.map(normalizeCardLast4));
  let earliest = Number.POSITIVE_INFINITY;
  let picked: string | null = null;

  for (const last4 of candidates) {
    if (!known.has(last4)) continue;
    const idx = text.indexOf(last4);
    if (idx >= 0 && idx < earliest) {
      earliest = idx;
      picked = last4;
    }
  }

  return picked;
}

function panDigits(pan: string): string {
  return pan.replace(/\D/g, "");
}

function last4FromFullPanMatch(
  text: string,
  cards: KnownCardForLast4[],
): string | null {
  const flat = text.replace(/\s+/g, " ");
  const flatDigits = text.replace(/\D/g, "");
  let best: { last4: string; length: number } | null = null;

  for (const card of cards) {
    const fullPan = card.fullPan?.trim();
    if (!fullPan) continue;

    const digits = panDigits(fullPan);
    const spaced = fullPan.replace(/\s+/g, " ").trim();
    const matches =
      (digits.length >= 8 && flatDigits.includes(digits)) ||
      flat.includes(spaced);

    if (!matches) continue;

    const length = Math.max(digits.length, spaced.length);
    if (!best || length > best.length) {
      best = { last4: card.last4, length };
    }
  }

  return best ? normalizeCardLast4(best.last4) : null;
}

const SUBJECT_STOP_WORDS = new Set([
  "unionbank",
  "rewards",
  "visa",
  "platinum",
  "credit",
  "card",
  "statement",
  "account",
  "electronic",
]);

/** Unionbank subjects: "… Credit Card ending in 6607 e-Statement" */
function last4FromSubjectEndingPattern(
  subject: string,
  cards: KnownCardForLast4[],
): string | null {
  const endingRe =
    /(?:ending|last\s+4|card\s+(?:no\.?|number))\s*(?:in|is|:)?\s*(?:\*{2,}\s*)?(\d{4})\b/i;
  const m = subject.match(endingRe);
  if (!m?.[1]) return null;

  const digits = normalizeCardLast4(m[1]);
  const known = new Set(cards.map((c) => normalizeCardLast4(c.last4)));
  return known.has(digits) ? digits : null;
}

function last4FromEmailSubject(
  subject: string,
  cards: KnownCardForLast4[],
): string | null {
  const fromEnding = last4FromSubjectEndingPattern(subject, cards);
  if (fromEnding) return fromEnding;

  const subjectLower = subject.toLowerCase();
  const labeled = cards.filter((card) => card.label?.trim());
  const byLabelLength = [...labeled].sort(
    (a, b) => b.label!.trim().length - a.label!.trim().length,
  );

  for (const card of byLabelLength) {
    const labelLower = card.label!.trim().toLowerCase();
    if (subjectLower.includes(labelLower)) {
      return normalizeCardLast4(card.last4);
    }
  }

  let best: { last4: string; score: number } | null = null;
  let secondBest = 0;

  for (const card of labeled) {
    const labelLower = card.label!.trim().toLowerCase();
    for (const rawWord of labelLower.split(/[\s+]+/)) {
      const word = rawWord.replace(/[^a-z0-9]/gi, "");
      if (word.length < 4 || SUBJECT_STOP_WORDS.has(word)) continue;
      if (!subjectLower.includes(word)) continue;

      const score = word.length;
      if (!best || score > best.score) {
        secondBest = best?.score ?? 0;
        best = { last4: card.last4, score };
      } else if (score > secondBest) {
        secondBest = score;
      }
    }
  }

  if (best && best.score > secondBest) {
    return normalizeCardLast4(best.last4);
  }

  return null;
}

/**
 * Prefer the card last-4 printed on the SOA over the credential that unlocked the PDF.
 * Same-bank cards often share one PDF password; the first password in CARDS_JSON would
 * otherwise label every PDF with the same last-4.
 */
export function resolveCardLast4FromSoaText(
  text: string,
  knownCards: KnownCardForLast4[],
  unlockLast4: string,
  emailSubject?: string,
): string {
  const normalizedKnown = knownCards.map((c) => normalizeCardLast4(c.last4));
  const unlockNorm = normalizeCardLast4(unlockLast4);

  const fromFullPan = last4FromFullPanMatch(text, knownCards);
  if (fromFullPan) return fromFullPan;

  const subject = emailSubject?.trim();
  if (subject) {
    const fromSubject = last4FromEmailSubject(subject, knownCards);
    if (fromSubject) return fromSubject;
  }

  const candidates = extractCardLast4Candidates(text);
  const matched = candidates.filter((c) => normalizedKnown.includes(c));
  if (matched.length === 1) return matched[0]!;

  if (matched.length > 1) {
    const fromText = firstKnownLast4InText(text, matched, normalizedKnown);
    if (fromText) return fromText;
  }

  if (candidates.length === 1 && normalizedKnown.includes(candidates[0]!)) {
    return candidates[0]!;
  }

  const fromText = firstKnownLast4InText(text, candidates, normalizedKnown);
  if (fromText && fromText !== unlockNorm) return fromText;

  return unlockNorm;
}
