import { describe, expect, test } from "vitest";

import { formatSoaRunToastMessage } from "./run-toast-message";

describe("formatSoaRunToastMessage", () => {
  test("no emails found", () => {
    expect(
      formatSoaRunToastMessage({
        parsedCount: 0,
        unavailable: 0,
        parseFailures: 0,
        downloadedPdfCount: 0,
        gmailSearchMessageCount: 0,
        gmailSearchPdfCount: 0,
        hasGmailReadScope: true,
        calendar: {
          created: 0,
          notice:
            "No parseable due dates on SOA rows — calendar events were not created.",
        },
      }),
    ).toBe(
      "No statement emails found for this period. Check Gmail account and SOA subject on each card.",
    );
  });

  test("partial parse failure", () => {
    expect(
      formatSoaRunToastMessage({
        parsedCount: 2,
        unavailable: 0,
        parseFailures: 1,
        downloadedPdfCount: 3,
        gmailSearchMessageCount: 3,
        gmailSearchPdfCount: 3,
        hasGmailReadScope: true,
      }),
    ).toBe(
      "Some statements could not be opened. Check PDF passwords on Credit Cards.",
    );
  });
});
