type SoaRunToastInput = {
  parsedCount: number;
  unavailable: number;
  parseFailures: number;
  downloadedPdfCount: number;
  gmailSearchMessageCount: number;
  gmailSearchPdfCount: number;
  hasGmailReadScope: boolean;
  calendar?: {
    created: number;
    error?: string;
    notice?: string;
  } | null;
};

/** Short message for SOA run toasts — keep technical detail in diagnostics/logs. */
export function formatSoaRunToastMessage(
  input: SoaRunToastInput,
): string | undefined {
  const {
    parsedCount,
    unavailable,
    parseFailures,
    downloadedPdfCount,
    gmailSearchMessageCount,
    gmailSearchPdfCount,
    hasGmailReadScope,
    calendar,
  } = input;

  if (!hasGmailReadScope) {
    return "Gmail access expired. Reconnect Google in Settings.";
  }

  if (parsedCount === 0) {
    if (parseFailures > 0 && downloadedPdfCount > 0) {
      return "Could not open statement PDFs. Check PDF passwords on Credit Cards.";
    }
    if (gmailSearchMessageCount === 0) {
      return "No statement emails found for this period. Check Gmail account and SOA subject on each card.";
    }
    if (gmailSearchPdfCount === 0) {
      return "Found emails but no statement PDFs for your cards.";
    }
    if (unavailable > 0) {
      const noun = unavailable === 1 ? "card" : "cards";
      return `${unavailable} ${noun} had no SOA email this period.`;
    }
    return "No statements parsed for this period.";
  }

  if (parseFailures > 0) {
    return "Some statements could not be opened. Check PDF passwords on Credit Cards.";
  }

  if (calendar?.error) {
    return "Statements saved. Calendar sync failed.";
  }

  if (calendar && calendar.created === 0 && calendar.notice) {
    return "Statements saved. No calendar events were added.";
  }

  return undefined;
}
