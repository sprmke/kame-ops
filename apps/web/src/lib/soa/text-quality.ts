// @ts-nocheck
/**
 * Bank-agnostic heuristics for deciding whether pdf.js text extraction produced
 * usable text, or whether we should fall back to OCR.
 *
 * PDF text layers go missing or garbled for many reasons that have nothing to do
 * with which bank issued the statement: scanned/image-only pages, custom or
 * subset-embedded fonts whose cmap does not map back to real Unicode, vector-outline
 * text (no text layer at all), or a corrupted/partial download. Every SOA — regardless
 * of issuer — prints peso amounts and dates, so their absence (or a high ratio of
 * unmapped/control glyphs) is a reliable, issuer-independent signal that the "text"
 * pdf.js recovered is not usable for regex parsing.
 */

const MIN_USABLE_LENGTH = 120;

/** Peso amounts like "1,234.56" or "123.45" — every SOA has several. */
const MONEY_TOKEN = /\d{1,3}(?:,\d{3})*\.\d{2}/g;

/** Any recognizable calendar date shape used across bank templates. */
const DATE_TOKEN =
  /\b(?:\d{1,2}[/-]\d{1,2}[/-]\d{2,4}|[A-Za-z]{3,9}\s+\d{1,2},?\s*\d{4}|\d{1,2}\s+[A-Za-z]{3,9}\s+\d{4})\b/g;

/**
 * pdf.js maps a font's glyph ids to whatever Unicode code points the font's cmap
 * declares. When a bank embeds a symbol/subset font (or the subset is broken), the
 * "text" comes out as runs of control chars, private-use-area glyphs, or the Unicode
 * replacement character — patterns real statement prose or tables never produce.
 */
function garbledCharRatio(text: string): number {
  if (!text) return 1;
  const sample = text.slice(0, 8000);
  if (sample.length === 0) return 1;
  let weird = 0;
  for (const ch of sample) {
    const code = ch.codePointAt(0) ?? 0;
    const isPrivateUse = code >= 0xe000 && code <= 0xf8ff;
    const isControl = code < 0x09 || (code > 0x0d && code < 0x20);
    const isReplacement = code === 0xfffd;
    if (isPrivateUse || isControl || isReplacement) weird++;
  }
  return weird / sample.length;
}

/**
 * Common legitimate banner/divider characters. Real bank statements print rows of
 * these as visual separators or "*** END OF STATEMENT ***" footers — never a sign of
 * a broken font mapping — so they must never trip the garbled-text heuristic below.
 */
const DIVIDER_CHARS = new Set(["*", "-", "=", "_", "~", ".", "#", "•", "+"]);

/**
 * Long runs of the *same* non-divider punctuation character, or repeating bracket
 * clusters (e.g. "()()()…"), signal a broken font/glyph remap — a pattern real
 * statement prose or tables never produce on their own.
 */
function hasGlyphSubstitutionArtifacts(text: string): boolean {
  const repeatedSameChar = text.match(/([^\w\s])\1{4,}/g) ?? [];
  for (const run of repeatedSameChar) {
    if (!DIVIDER_CHARS.has(run[0]!)) return true;
  }
  return /(\(\)){4,}/.test(text);
}

export type SoaTextQuality = {
  length: number;
  moneyTokenCount: number;
  dateTokenCount: number;
  garbledRatio: number;
  looksUsable: boolean;
  /** Human-readable reasons the text was flagged (empty when usable). */
  reasons: string[];
};

/**
 * Scores extracted SOA text without any knowledge of which bank issued it.
 * Used to decide whether to fall back to OCR, and to pick the better of two
 * text candidates (e.g. pdf.js text vs. OCR text) after the fact.
 */
export function assessSoaTextQuality(
  text: string | null | undefined,
): SoaTextQuality {
  const trimmed = (text ?? "").trim();
  const moneyTokenCount = trimmed.match(MONEY_TOKEN)?.length ?? 0;
  const dateTokenCount = trimmed.match(DATE_TOKEN)?.length ?? 0;
  const garbledRatio = garbledCharRatio(trimmed);

  const reasons: string[] = [];
  if (trimmed.length < MIN_USABLE_LENGTH)
    reasons.push("too little text extracted");
  if (moneyTokenCount === 0) reasons.push("no peso amounts found");
  if (dateTokenCount === 0) reasons.push("no dates found");
  if (garbledRatio > 0.03) reasons.push("garbled/unmapped glyphs");
  if (hasGlyphSubstitutionArtifacts(trimmed)) {
    reasons.push("repeated punctuation runs (broken font mapping)");
  }

  return {
    length: trimmed.length,
    moneyTokenCount,
    dateTokenCount,
    garbledRatio,
    looksUsable: reasons.length === 0,
    reasons,
  };
}

export function soaTextLooksUsable(text: string | null | undefined): boolean {
  return assessSoaTextQuality(text).looksUsable;
}

/**
 * Narrower check for per-call safety nets (e.g. before running bank-specific
 * transaction-line regexes over a text slice). Unlike `assessSoaTextQuality`, this
 * does not require money/date tokens to be present — a valid slice of transaction
 * lines (e.g. geometry-reordered RCBC lines) may legitimately not include a
 * full-year date or peso amount. It only flags text that is empty or shows the
 * unmapped-glyph / repeated-punctuation signatures of a broken font extraction.
 */
export function looksGarbled(text: string | null | undefined): boolean {
  const trimmed = (text ?? "").trim();
  if (!trimmed) return true;
  return (
    garbledCharRatio(trimmed) > 0.03 || hasGlyphSubstitutionArtifacts(trimmed)
  );
}

/**
 * Ranks two text candidates for the same PDF (e.g. pdf.js extract vs. OCR pass) and
 * returns whichever looks more usable. Ties keep `current` (avoids swapping to an
 * equally-bad OCR result and paying the cost of nothing).
 */
export function pickBetterSoaText(
  current: string,
  candidate: string,
): { text: string; usedCandidate: boolean; quality: SoaTextQuality } {
  const currentQuality = assessSoaTextQuality(current);
  if (currentQuality.looksUsable) {
    return { text: current, usedCandidate: false, quality: currentQuality };
  }
  const candidateQuality = assessSoaTextQuality(candidate);
  const candidateIsBetter =
    candidateQuality.looksUsable ||
    candidateQuality.reasons.length < currentQuality.reasons.length ||
    (candidateQuality.reasons.length === currentQuality.reasons.length &&
      candidateQuality.moneyTokenCount > currentQuality.moneyTokenCount);

  if (candidateIsBetter && candidate.trim().length > 0) {
    return { text: candidate, usedCandidate: true, quality: candidateQuality };
  }
  return { text: current, usedCandidate: false, quality: currentQuality };
}
