import { describe, expect, test } from "bun:test";

import { dedupeDownloadedPdfs } from "./dedupe-downloaded-pdfs";
import type { DownloadedPdf } from "./gmail-fetch";

function pdf(overrides: Partial<DownloadedPdf>): DownloadedPdf {
  return {
    bankId: "metrobank",
    bankLabel: "Metrobank",
    messageId: "msg-1",
    subject: "Metrobank Credit Card MSOA Statement of Account",
    fileName: "statement-1.pdf",
    filePath: "/tmp/metrobank-msg-1-0-statement-1.pdf",
    ...overrides,
  };
}

describe("dedupeDownloadedPdfs", () => {
  test("keeps multiple PDF attachments from the same Gmail message (multi-card email)", () => {
    // A single combined email can carry two card statements as separate attachments.
    const cardA = pdf({
      messageId: "msg-1",
      fileName: "statement-cardA.pdf",
      filePath: "/tmp/metrobank-msg1abcd-0-statement-cardA.pdf",
    });
    const cardB = pdf({
      messageId: "msg-1",
      fileName: "statement-cardB.pdf",
      filePath: "/tmp/metrobank-msg1abcd-1-statement-cardB.pdf",
    });

    const result = dedupeDownloadedPdfs([cardA, cardB]);

    expect(result).toHaveLength(2);
    expect(result.map((p) => p.filePath)).toEqual([
      cardA.filePath,
      cardB.filePath,
    ]);
  });

  test("collapses the exact same attachment when returned by overlapping search configs", () => {
    // Two Gmail search configs (e.g. different soaSubject overrides) can both
    // return the same underlying message/attachment.
    const first = pdf({ filePath: "/tmp/metrobank-msg1abcd-0-statement.pdf" });
    const duplicate = pdf({
      filePath: "/tmp/metrobank-msg1abcd-0-statement.pdf",
    });

    const result = dedupeDownloadedPdfs([first, duplicate]);

    expect(result).toHaveLength(1);
  });

  test("keeps attachments from different messages and different banks", () => {
    const a = pdf({
      bankId: "metrobank",
      messageId: "msg-1",
      filePath: "/tmp/metrobank-msg1-0-a.pdf",
    });
    const b = pdf({
      bankId: "rcbc",
      bankLabel: "RCBC",
      messageId: "msg-2",
      filePath: "/tmp/rcbc-msg2-0-b.pdf",
    });

    const result = dedupeDownloadedPdfs([a, b]);

    expect(result).toHaveLength(2);
  });

  test("returns an empty array for no input", () => {
    expect(dedupeDownloadedPdfs([])).toEqual([]);
  });
});
