// @ts-nocheck
/**
 * OCR is attempted automatically for ANY issuer once the extracted text looks
 * unusable (empty, no peso amounts/dates, garbled glyphs — see `text-quality.ts`).
 * No per-bank flag is required for this to kick in. These env vars only *override*
 * that default: force OCR even when text looks fine (`SOA_OCR_FORCE`), or disable it
 * entirely — e.g. to avoid OCR latency on a constrained deployment (`SOA_OCR_DISABLE`).
 * `BPI_OCR*` names are kept as BPI-specific back-compat aliases for `SOA_OCR*`.
 */

export function envFlag(name: string): boolean {
  return /^(1|true|yes)$/i.test(process.env[name]?.trim() ?? "");
}

export function envCsvSet(name: string): Set<string> {
  return new Set(
    (process.env[name] ?? "")
      .split(",")
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean),
  );
}

export function ocrForcedForIssuer(issuerId: string): boolean {
  const forced = envCsvSet("SOA_OCR_FORCE");
  if (forced.has("all") || forced.has(issuerId.toLowerCase())) return true;
  if (issuerId.toLowerCase() === "bpi" && envFlag("BPI_OCR")) return true;
  return false;
}

export function ocrDisabledForIssuer(issuerId: string): boolean {
  const disabled = envCsvSet("SOA_OCR_DISABLE");
  return disabled.has("all") || disabled.has(issuerId.toLowerCase());
}

export function ocrTuningForIssuer(issuerId: string) {
  const isBpi = issuerId.toLowerCase() === "bpi";
  const pick = (generic: string, bpiLegacy: string): string =>
    process.env[generic]?.trim() ||
    (isBpi ? process.env[bpiLegacy]?.trim() : undefined) ||
    "";

  const rawPages = pick("SOA_OCR_PAGES", "BPI_OCR_PAGES");
  const parsedPages = rawPages !== "" ? Number.parseInt(rawPages, 10) : 0;
  const maxPages =
    !Number.isFinite(parsedPages) || parsedPages <= 0
      ? 0
      : Math.min(50, Math.max(1, parsedPages));

  const rawScale = pick("SOA_OCR_SCALE", "BPI_OCR_SCALE");
  const scale = Math.min(4, Math.max(1.5, Number.parseFloat(rawScale) || 3));

  const dualSparse =
    envFlag("SOA_OCR_DUAL") || (isBpi && envFlag("BPI_OCR_DUAL"));
  const debug = envFlag("SOA_OCR_DEBUG") || (isBpi && envFlag("BPI_OCR_DEBUG"));

  return {
    maxPages,
    scale,
    dualSparse,
    debug,
    /** Raw PSM string; caller resolves via `parseSoaOcrPsmEnv` (kept out of this module to avoid a tesseract.js import at diagnostics-check time). */
    psmRaw: pick("SOA_OCR_PSM", "BPI_OCR_PSM") || undefined,
  };
}

/** All issuer ids forced into OCR mode by env, for diagnostics display. */
export function forcedOcrIssuers(knownIssuerIds: string[]): string[] {
  const forced = envCsvSet("SOA_OCR_FORCE");
  const bpiForced = envFlag("BPI_OCR");
  if (forced.has("all")) return knownIssuerIds;
  const out = new Set<string>();
  for (const id of knownIssuerIds) {
    if (forced.has(id.toLowerCase())) out.add(id);
  }
  if (bpiForced) out.add("bpi");
  return [...out];
}

/** All issuer ids with OCR fallback disabled by env, for diagnostics display. */
export function disabledOcrIssuers(knownIssuerIds: string[]): string[] {
  const disabled = envCsvSet("SOA_OCR_DISABLE");
  if (disabled.has("all")) return knownIssuerIds;
  return knownIssuerIds.filter((id) => disabled.has(id.toLowerCase()));
}
