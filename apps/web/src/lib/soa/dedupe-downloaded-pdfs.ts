import type { DownloadedPdf } from "./gmail-fetch";

/**
 * Dedupe downloaded PDFs collected across multiple Gmail search configs (e.g.
 * per-card `gmailMonthOffset`/`soaSubject` overrides that can return the same
 * message more than once).
 *
 * Keys on `filePath`, not `messageId`, on purpose: a single Gmail message can
 * carry multiple PDF attachments (e.g. one combined email covering two cards
 * under the same issuer). `filePath` already encodes bankId + messageId +
 * attachment index, so distinct attachments within one message are kept while
 * the same attachment refetched by an overlapping search config still
 * collapses to a single entry.
 */
export function dedupeDownloadedPdfs(
  pdfs: readonly DownloadedPdf[],
): DownloadedPdf[] {
  const seen = new Set<string>();
  const out: DownloadedPdf[] = [];
  for (const pdf of pdfs) {
    if (seen.has(pdf.filePath)) continue;
    seen.add(pdf.filePath);
    out.push(pdf);
  }
  return out;
}
