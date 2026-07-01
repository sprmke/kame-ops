// @ts-nocheck
import fs from "node:fs";
import path from "node:path";
import PDFDocument from "pdfkit";
import type { SoaRow, TransactionLine } from "@/lib/soa/types";

type PdfDoc = InstanceType<typeof PDFDocument>;

const TX_DISPLAY_CAP = 55;
const PAGE_BOTTOM = 740;
const MARGIN = 50;
const CONTENT_W = 512; // 612 - 2*50
const RIGHT_X = MARGIN + CONTENT_W;

const LINE = "#d4d4d4";
const LINE_SUBTLE = "#e8e8e8";
const HEADER_BG = "#f0f0f0";
const MUTED = "#555555";
const GRAND_TOTAL_BG = "#e8edf3";
const GRAND_TOTAL_RULE = "#64748b";

/** Transaction rows to review for reversal (fees, finance charges, penalties). */
const CHARGE_ALERT_BG = "#ffedd5";
const CHARGE_ALERT_FG = "#c2410c";

const CHARGE_ALERT_PATTERNS: RegExp[] = [
  /\bfinance\s+charges?\b/i,
  /\binterest\s+charges?\b/i,
  /\blate\s+(payment|fee|charge|charges)\b/i,
  /\bpast\s+due\b/i,
  /\bpenalt(y|ies)\b/i,
  /\bservice\s+(fee|charge|charges)\b/i,
  /\b(annual|membership)\s+fee\b/i,
  /\bcash\s+advance\s+(fee|charge)?\b/i,
  /\bover[\s-]?limit\b/i,
  /\b(collection|legal)\s+fee\b/i,
  /\breturn(ed)?\s+payment\b/i,
  /\binsufficient\s+funds\b/i,
  /\bnsf\b/i,
  /\bdishonou?r(ed)?\b/i,
  /\bprocessing\s+fee\b/i,
  /\b(card\s+)?replacement\s+fee\b/i,
  /\breactivation\s+fee\b/i,
  /\b(conversion|fx|foreign\s+exchange)\s+fee\b/i,
  /\bforeign\s+txn\s+fee\b/i,
  /\bother\s+charges?\b/i,
  /\bmisc(elaneous)?\s+charges?\b/i,
  /\bmonthly\s+charges?\b/i,
  /\bcharges?\s+&?\s*fees?\b/i,
  /\bunbilled\s+interest\b/i,
  /\brevolving\s+interest\b/i,
];

export function transactionLooksLikeFeeOrFinanceCharge(
  description: string,
): boolean {
  if (!description.trim()) return false;
  return CHARGE_ALERT_PATTERNS.some((re) => re.test(description));
}

export type RangeMonthSection = {
  periodLabel: string;
  periodKey: string;
  rows: SoaRow[];
};

type ConsolidatedFeeRow = {
  periodLabel: string;
  bankLabel: string;
  cardLast4: string;
  /** Full PAN when configured, else masked last4. */
  cardDisplay: string;
  date: string;
  description: string;
  amount: string;
};

function collectConsolidatedFeeRows(
  sections: RangeMonthSection[],
): ConsolidatedFeeRow[] {
  const out: ConsolidatedFeeRow[] = [];
  for (const s of sections) {
    for (const r of s.rows) {
      if (r.soaUnavailable || r.cardLast4 === "—") continue;
      for (const t of r.transactions ?? []) {
        if (transactionLooksLikeFeeOrFinanceCharge(t.description)) {
          const cardDisplay = r.fullPan?.trim() || `****${r.cardLast4}`;
          out.push({
            periodLabel: s.periodLabel,
            bankLabel: overviewBankLabel(r),
            cardLast4: r.cardLast4,
            cardDisplay,
            date: t.date,
            description: t.description,
            amount: t.amount,
          });
        }
      }
    }
  }
  return out;
}

/** Overview table: wider “Card” column for full PAN + contact line. */
/** Card column narrowed so Bank + currency columns have more room (grand total aligns). */
const COL_W = [52, 110, 82, 82, 70, 70, 46] as const;
const COL_X = [
  MARGIN,
  MARGIN + COL_W[0],
  MARGIN + COL_W[0] + COL_W[1],
  MARGIN + COL_W[0] + COL_W[1] + COL_W[2],
  MARGIN + COL_W[0] + COL_W[1] + COL_W[2] + COL_W[3],
  MARGIN + COL_W[0] + COL_W[1] + COL_W[2] + COL_W[3] + COL_W[4],
  MARGIN + COL_W[0] + COL_W[1] + COL_W[2] + COL_W[3] + COL_W[4] + COL_W[5],
] as const;

function overviewBankLabel(r: SoaRow): string {
  return r.cardDisplayLabel?.trim() || r.bankLabel;
}

/** Overview “Card” column: PAN only (contact is under each card heading in the transaction section). */
function overviewCardCell(r: SoaRow): string {
  if (r.cardLast4 === "—") return "—";
  return r.fullPan?.trim() || `****${r.cardLast4}`;
}

function txnSectionHeading(r: SoaRow): { title: string; subtitle?: string } {
  const pan =
    r.cardLast4 === "—" ? "—" : r.fullPan?.trim() || `****${r.cardLast4}`;
  const bank = overviewBankLabel(r);
  const subtitle = r.contactLine?.trim();
  return subtitle
    ? { title: `${bank} — ${pan}`, subtitle }
    : { title: `${bank} — ${pan}` };
}

function drawTxnSectionHeading(doc: PdfDoc, y: number, r: SoaRow): number {
  const { title, subtitle } = txnSectionHeading(r);
  y = ensureY(doc, y, 28);
  doc.font("Helvetica-Bold").fontSize(10).fillColor("#1f2937");
  const titleH = doc.heightOfString(title, { width: CONTENT_W });
  doc.text(title, MARGIN, y, { width: CONTENT_W });
  y += titleH;
  if (subtitle) {
    doc.font("Helvetica").fontSize(8).fillColor(MUTED);
    const subH = doc.heightOfString(subtitle, { width: CONTENT_W });
    y = ensureY(doc, y, subH + 6);
    doc.text(subtitle, MARGIN, y, { width: CONTENT_W });
    y += subH + 8;
    doc.fillColor("#000000");
  } else {
    y += 8;
  }
  return y;
}

function isSoaUnavailable(r: SoaRow): boolean {
  if (r.soaUnavailable) return true;
  return r.minimumDue === "SOA not yet available";
}

/** Parse displayed SOA currency (commas, em dash = missing). */
function parsePesoAmount(raw: string): number | null {
  const s = raw.replace(/,/g, "").trim();
  if (!s || s === "—" || s === "-") return null;
  const n = Number.parseFloat(s);
  return Number.isFinite(n) ? n : null;
}

function formatMoney(n: number): string {
  return n.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function sumOverviewTotals(rows: SoaRow[]): {
  sumMinimum: number;
  sumTotal: number;
  nMinimum: number;
  nTotal: number;
} {
  let sumMinimum = 0;
  let sumTotal = 0;
  let nMinimum = 0;
  let nTotal = 0;
  for (const r of rows) {
    if (isSoaUnavailable(r)) continue;
    const m = parsePesoAmount(r.minimumDue);
    const t = parsePesoAmount(r.totalDue);
    if (m !== null) {
      sumMinimum += m;
      nMinimum++;
    }
    if (t !== null) {
      sumTotal += t;
      nTotal++;
    }
  }
  return { sumMinimum, sumTotal, nMinimum, nTotal };
}

function ensureY(doc: PdfDoc, y: number, need: number): number {
  if (y + need > PAGE_BOTTOM) {
    doc.addPage();
    return MARGIN;
  }
  return y;
}

/** PDFKit `text(..., y)` uses y as top of line box when lineBreak is true. */
function vCenterTop(rowTop: number, rowH: number, textBlockH: number): number {
  return rowTop + (rowH - textBlockH) / 2;
}

const OVERVIEW_VPAD = 6;

function overviewContentHeights(
  doc: PdfDoc,
  parts: readonly string[],
  widths: readonly number[],
): number[] {
  return parts.map((p, i) => doc.heightOfString(p, { width: widths[i]! }));
}

function overviewRowHeightFromHeights(heights: number[]): number {
  const maxH = Math.max(...heights, 11);
  return maxH + OVERVIEW_VPAD * 2;
}

export async function writeSummaryPdf(
  rows: SoaRow[],
  outPath: string,
  title: string,
  /** Used in the reversal-request table “Month” column; e.g. `March 2026`. */
  feePeriodLabel: string,
  resolvePaidLabel: (row: SoaRow) => string,
): Promise<void> {
  await fs.promises.mkdir(path.dirname(outPath), { recursive: true });

  const doc = new PDFDocument({ margin: MARGIN, size: "LETTER" });
  const stream = fs.createWriteStream(outPath);
  doc.pipe(stream);

  doc.font("Helvetica-Bold").fontSize(20).fillColor("#111827").text(title, {
    align: "center",
    width: CONTENT_W,
  });
  doc.moveDown(0.6);
  doc.moveTo(MARGIN, doc.y).lineTo(RIGHT_X, doc.y).stroke(LINE);
  doc.moveDown(0.8);
  doc.font("Helvetica").fillColor("#000000");

  if (rows.length === 0) {
    doc.fontSize(12).text("No statements were parsed for this run.");
    doc.end();
    await new Promise<void>((resolve, reject) => {
      stream.on("finish", resolve);
      stream.on("error", reject);
    });
    return;
  }

  const paidLabel = resolvePaidLabel;

  doc.font("Helvetica-Bold").fontSize(12).fillColor("#111827").text("Overview");
  doc.moveDown(0.4);
  let y = doc.y;

  const drawOverviewHeader = (): void => {
    const barH = 22;
    const rowTop = y;
    doc.save();
    doc.rect(MARGIN, rowTop, CONTENT_W, barH).fill(HEADER_BG);
    doc.restore();
    const labels = [
      "Bank",
      "Card",
      "Min due",
      "Total due",
      "Stmt date",
      "Due date",
      "Is paid",
    ] as const;
    doc.font("Helvetica-Bold").fontSize(8).fillColor("#374151");
    for (let i = 0; i < 7; i++) {
      const h = doc.heightOfString(labels[i], { width: COL_W[i]! });
      const ty = vCenterTop(rowTop, barH, h);
      doc.text(labels[i], COL_X[i]!, ty, { width: COL_W[i]! });
    }
    doc.fillColor("#000000").font("Helvetica");
    y = rowTop + barH;
    doc.moveTo(MARGIN, y).lineTo(RIGHT_X, y).stroke(LINE);
    y += 8;
  };

  drawOverviewHeader();

  for (const r of rows) {
    const unavailable = isSoaUnavailable(r);
    doc.font("Helvetica").fontSize(9);

    if (unavailable) {
      const status = "SOA not yet available";
      const statusW = RIGHT_X - COL_X[2];
      const bank = overviewBankLabel(r);
      const card = overviewCardCell(r);
      const heights = overviewContentHeights(
        doc,
        [bank, card, status],
        [COL_W[0]!, COL_W[1]!, statusW],
      );
      const rowH = overviewRowHeightFromHeights(heights);
      y = ensureY(doc, y, rowH + 14);
      const rowTop = y;

      doc.fillColor("#111827");
      doc.text(bank, COL_X[0], vCenterTop(rowTop, rowH, heights[0]!), {
        width: COL_W[0],
      });
      doc.text(card, COL_X[1], vCenterTop(rowTop, rowH, heights[1]!), {
        width: COL_W[1],
      });
      doc
        .fillColor(MUTED)
        .text(status, COL_X[2], vCenterTop(rowTop, rowH, heights[2]!), {
          width: statusW,
        });
      doc.fillColor("#000000");

      y = rowTop + rowH;
      doc.moveTo(MARGIN, y).lineTo(RIGHT_X, y).stroke(LINE_SUBTLE);
      y += 6;
      continue;
    }

    const parts: [string, string, string, string, string, string, string] = [
      overviewBankLabel(r),
      overviewCardCell(r),
      r.minimumDue,
      r.totalDue,
      r.statementDate,
      r.dueDate,
      paidLabel(r),
    ];
    const heights = overviewContentHeights(doc, parts, [...COL_W]);
    const rowH = overviewRowHeightFromHeights(heights);
    y = ensureY(doc, y, rowH + 14);
    const rowTop = y;

    for (let i = 0; i < 7; i++) {
      doc.text(
        parts[i] ?? "",
        COL_X[i]!,
        vCenterTop(rowTop, rowH, heights[i]!),
        { width: COL_W[i]! },
      );
    }
    y = rowTop + rowH;
    doc.moveTo(MARGIN, y).lineTo(RIGHT_X, y).stroke(LINE_SUBTLE);
    y += 6;
  }

  const { sumMinimum, sumTotal, nMinimum, nTotal } = sumOverviewTotals(rows);
  y += 10;
  y = ensureY(doc, y, 56);

  doc.save();
  doc.lineWidth(1.35).strokeColor(GRAND_TOTAL_RULE);
  doc.moveTo(MARGIN, y).lineTo(RIGHT_X, y).stroke();
  doc.lineWidth(1).strokeColor("#000000");
  doc.restore();

  y += 6;

  const gtBarH = 34;
  y = ensureY(doc, y, gtBarH + 48);
  const gtTop = y;

  doc.save();
  doc.rect(MARGIN, gtTop, CONTENT_W, gtBarH).fill(GRAND_TOTAL_BG);
  doc.restore();

  const label = "Grand total";
  const labelInset = 10;
  const labelMaxW = COL_X[2] - MARGIN - labelInset;
  doc.font("Helvetica-Bold").fontSize(11).fillColor("#0f172a");
  const labelH = doc.heightOfString(label, { width: labelMaxW });
  doc.text(label, MARGIN + labelInset, vCenterTop(gtTop, gtBarH, labelH), {
    width: labelMaxW,
  });

  const minStr = nMinimum > 0 ? formatMoney(sumMinimum) : "—";
  const totStr = nTotal > 0 ? formatMoney(sumTotal) : "—";
  doc.font("Helvetica-Bold").fontSize(10).fillColor("#0f172a");
  const hMin = doc.heightOfString(minStr, { width: COL_W[2] });
  doc.text(minStr, COL_X[2], vCenterTop(gtTop, gtBarH, hMin), {
    width: COL_W[2],
    align: "right",
  });
  const hTot = doc.heightOfString(totStr, { width: COL_W[3] });
  doc.text(totStr, COL_X[3], vCenterTop(gtTop, gtBarH, hTot), {
    width: COL_W[3],
    align: "right",
  });

  doc.font("Helvetica").fontSize(9).fillColor("#94a3b8");
  for (const ci of [4, 5, 6] as const) {
    const dash = "—";
    const dh = doc.heightOfString(dash, { width: COL_W[ci]! });
    doc.text(dash, COL_X[ci]!, vCenterTop(gtTop, gtBarH, dh), {
      width: COL_W[ci]!,
    });
  }
  doc.fillColor("#000000").font("Helvetica");

  y = gtTop + gtBarH;
  doc.moveTo(MARGIN, y).lineTo(RIGHT_X, y).stroke(LINE_SUBTLE);

  y += 36;
  y = ensureY(doc, y, 80);
  doc
    .font("Helvetica-Bold")
    .fontSize(12)
    .fillColor("#111827")
    .text("Transaction breakdown", MARGIN, y, { width: CONTENT_W });
  y += 26;
  doc.font("Helvetica").fillColor("#000000");

  for (const r of rows) {
    const unavailable = isSoaUnavailable(r);
    y = drawTxnSectionHeading(doc, y, r);

    if (unavailable) {
      doc
        .font("Helvetica")
        .fontSize(9)
        .fillColor(MUTED)
        .text("SOA not yet available.", MARGIN, y, { width: CONTENT_W });
      y += 18;
      doc.fillColor("#000000");
      doc.moveTo(MARGIN, y).lineTo(RIGHT_X, y).stroke(LINE);
      y += 12;
      continue;
    }

    const txs = r.transactions ?? [];
    if (txs.length === 0) {
      y = ensureY(doc, y, 28);
      doc
        .font("Helvetica")
        .fontSize(9)
        .fillColor(MUTED)
        .text("No transaction lines extracted for this SOA.", MARGIN, y, {
          width: CONTENT_W,
        });
      y += 20;
      doc.fillColor("#000000");
      doc.moveTo(MARGIN, y).lineTo(RIGHT_X, y).stroke(LINE);
      y += 12;
      continue;
    }

    const txHeadH = 20;
    y = ensureY(doc, y, txHeadH + 12);
    const txHeadTop = y;
    doc.save();
    doc.rect(MARGIN, txHeadTop, CONTENT_W, txHeadH).fill(HEADER_BG);
    doc.restore();
    doc.font("Helvetica-Bold").fontSize(8).fillColor("#374151");
    const txLabels = ["Date (post / tran)", "Description", "Amount"] as const;
    const txLabelX = [MARGIN, 150, 465] as const;
    const txLabelW = [100, 310, 85] as const;
    const txLabelAlign: ("left" | "right")[] = ["left", "left", "right"];
    for (let i = 0; i < 3; i++) {
      const h = doc.heightOfString(txLabels[i], { width: txLabelW[i] });
      const ty = vCenterTop(txHeadTop, txHeadH, h);
      doc.text(txLabels[i], txLabelX[i], ty, {
        width: txLabelW[i],
        align: txLabelAlign[i],
      });
    }
    y = txHeadTop + txHeadH;
    doc.moveTo(MARGIN, y).lineTo(RIGHT_X, y).stroke(LINE);
    y += 8;
    doc.font("Helvetica").fontSize(8).fillColor("#000000");

    const TX_ROW_VPAD = 6;
    const slice = txs.slice(0, TX_DISPLAY_CAP);
    for (const t of slice) {
      const wDate = 95;
      const wDesc = 305;
      const wAmt = 90;
      const hDate = doc.heightOfString(t.date, { width: wDate });
      const hDesc = doc.heightOfString(t.description, { width: wDesc });
      const hAmt = doc.heightOfString(t.amount, { width: wAmt });
      const innerH = Math.max(hDate, hDesc, hAmt, 10);
      const rowH = innerH + TX_ROW_VPAD * 2;
      y = ensureY(doc, y, rowH + 4);
      const rowTop = y;

      const feeHighlight = transactionLooksLikeFeeOrFinanceCharge(
        t.description,
      );
      if (feeHighlight) {
        doc.save();
        doc.rect(MARGIN, rowTop, CONTENT_W, rowH).fill(CHARGE_ALERT_BG);
        doc.restore();
      }

      doc.fontSize(8).fillColor(feeHighlight ? CHARGE_ALERT_FG : "#000000");
      doc.text(t.date, MARGIN, vCenterTop(rowTop, rowH, hDate), {
        width: wDate,
      });
      doc.text(t.description, 150, vCenterTop(rowTop, rowH, hDesc), {
        width: wDesc,
      });
      doc.text(t.amount, 460, vCenterTop(rowTop, rowH, hAmt), {
        width: wAmt,
        align: "right",
      });
      doc.fillColor("#000000");

      y = rowTop + rowH;
      doc.moveTo(MARGIN, y).lineTo(RIGHT_X, y).stroke(LINE_SUBTLE);
    }

    if (txs.length > TX_DISPLAY_CAP) {
      y += 6;
      doc
        .fontSize(8)
        .fillColor(MUTED)
        .text(
          `… ${txs.length - TX_DISPLAY_CAP} more row(s) in the bank PDF (not all shown here).`,
          MARGIN,
          y,
          { width: CONTENT_W },
        );
      y += 16;
      doc.fillColor("#000000");
    }

    y += 8;
    doc.moveTo(MARGIN, y).lineTo(RIGHT_X, y).stroke(LINE);
    y += 14;
  }

  const feeRows = collectConsolidatedFeeRows([
    { periodLabel: feePeriodLabel, periodKey: "", rows },
  ]);
  y += 20;
  y = ensureY(doc, y, 80);
  y = drawConsolidatedFeeTable(doc, y, feeRows, "Reversal-request charges");

  doc.end();
  await new Promise<void>((resolve, reject) => {
    stream.on("finish", resolve);
    stream.on("error", reject);
  });
}

const MONTH_BAND_BG = "#0f172a";
const MONTH_BAND_FG = "#f8fafc";
const MONTH_BAND_H = 34;
const SUBHEAD_BG = "#e2e8f0";

/** Full transaction breakdown; no row cap (spans pages). Returns final y. */
function appendTransactionBreakdownUnlimited(
  doc: PdfDoc,
  y: number,
  rows: SoaRow[],
): number {
  y = ensureY(doc, y, 80);
  doc
    .font("Helvetica-Bold")
    .fontSize(12)
    .fillColor("#111827")
    .text("Transaction breakdown", MARGIN, y, { width: CONTENT_W });
  y += 26;
  doc.font("Helvetica").fillColor("#000000");

  for (const r of rows) {
    const unavailable = isSoaUnavailable(r);
    y = drawTxnSectionHeading(doc, y, r);

    if (unavailable) {
      y = ensureY(doc, y, 28);
      doc
        .font("Helvetica")
        .fontSize(9)
        .fillColor(MUTED)
        .text("SOA not yet available.", MARGIN, y, { width: CONTENT_W });
      y += 18;
      doc.fillColor("#000000");
      doc.moveTo(MARGIN, y).lineTo(RIGHT_X, y).stroke(LINE);
      y += 12;
      continue;
    }

    const txs: TransactionLine[] = r.transactions ?? [];
    if (txs.length === 0) {
      y = ensureY(doc, y, 28);
      doc
        .font("Helvetica")
        .fontSize(9)
        .fillColor(MUTED)
        .text("No transaction lines extracted for this SOA.", MARGIN, y, {
          width: CONTENT_W,
        });
      y += 20;
      doc.fillColor("#000000");
      doc.moveTo(MARGIN, y).lineTo(RIGHT_X, y).stroke(LINE);
      y += 12;
      continue;
    }

    const txHeadH = 20;
    y = ensureY(doc, y, txHeadH + 12);
    const txHeadTop = y;
    doc.save();
    doc.rect(MARGIN, txHeadTop, CONTENT_W, txHeadH).fill(HEADER_BG);
    doc.restore();
    doc.font("Helvetica-Bold").fontSize(8).fillColor("#374151");
    const txLabels = ["Date (post / tran)", "Description", "Amount"] as const;
    const txLabelX = [MARGIN, 150, 465] as const;
    const txLabelW = [100, 310, 85] as const;
    const txLabelAlign: ("left" | "right")[] = ["left", "left", "right"];
    for (let i = 0; i < 3; i++) {
      const h = doc.heightOfString(txLabels[i], { width: txLabelW[i] });
      const ty = vCenterTop(txHeadTop, txHeadH, h);
      doc.text(txLabels[i], txLabelX[i], ty, {
        width: txLabelW[i],
        align: txLabelAlign[i],
      });
    }
    y = txHeadTop + txHeadH;
    doc.moveTo(MARGIN, y).lineTo(RIGHT_X, y).stroke(LINE);
    y += 8;
    doc.font("Helvetica").fontSize(8).fillColor("#000000");

    const TX_ROW_VPAD = 6;
    for (const t of txs) {
      const wDate = 95;
      const wDesc = 305;
      const wAmt = 90;
      const hDate = doc.heightOfString(t.date, { width: wDate });
      const hDesc = doc.heightOfString(t.description, { width: wDesc });
      const hAmt = doc.heightOfString(t.amount, { width: wAmt });
      const innerH = Math.max(hDate, hDesc, hAmt, 10);
      const rowH = innerH + TX_ROW_VPAD * 2;
      y = ensureY(doc, y, rowH + 4);
      const rowTop = y;

      const feeHighlight = transactionLooksLikeFeeOrFinanceCharge(
        t.description,
      );
      if (feeHighlight) {
        doc.save();
        doc.rect(MARGIN, rowTop, CONTENT_W, rowH).fill(CHARGE_ALERT_BG);
        doc.restore();
      }

      doc.fontSize(8).fillColor(feeHighlight ? CHARGE_ALERT_FG : "#000000");
      doc.text(t.date, MARGIN, vCenterTop(rowTop, rowH, hDate), {
        width: wDate,
      });
      doc.text(t.description, 150, vCenterTop(rowTop, rowH, hDesc), {
        width: wDesc,
      });
      doc.text(t.amount, 460, vCenterTop(rowTop, rowH, hAmt), {
        width: wAmt,
        align: "right",
      });
      doc.fillColor("#000000");

      y = rowTop + rowH;
      doc.moveTo(MARGIN, y).lineTo(RIGHT_X, y).stroke(LINE_SUBTLE);
    }

    y += 8;
    doc.moveTo(MARGIN, y).lineTo(RIGHT_X, y).stroke(LINE);
    y += 14;
  }

  return y;
}

/** Overview + grand total for one period. Returns final y. */
function appendOverviewAndGrandTotal(
  doc: PdfDoc,
  y: number,
  rows: SoaRow[],
  paidLabel: (row: SoaRow) => string,
): number {
  doc
    .font("Helvetica-Bold")
    .fontSize(12)
    .fillColor("#111827")
    .text("Overview", MARGIN, y, {
      width: CONTENT_W,
    });
  y = doc.y + 10;

  const drawOverviewHeader = (rowTop: number): number => {
    const barH = 22;
    doc.save();
    doc.rect(MARGIN, rowTop, CONTENT_W, barH).fill(HEADER_BG);
    doc.restore();
    const labels = [
      "Bank",
      "Card",
      "Min due",
      "Total due",
      "Stmt date",
      "Due date",
      "Is paid",
    ] as const;
    doc.font("Helvetica-Bold").fontSize(8).fillColor("#374151");
    for (let i = 0; i < 7; i++) {
      const h = doc.heightOfString(labels[i], { width: COL_W[i]! });
      const ty = vCenterTop(rowTop, barH, h);
      doc.text(labels[i], COL_X[i]!, ty, { width: COL_W[i]! });
    }
    doc.fillColor("#000000").font("Helvetica");
    let ny = rowTop + barH;
    doc.moveTo(MARGIN, ny).lineTo(RIGHT_X, ny).stroke(LINE);
    ny += 8;
    return ny;
  };

  y = drawOverviewHeader(y);

  for (const r of rows) {
    const unavailable = isSoaUnavailable(r);
    doc.font("Helvetica").fontSize(9);

    if (unavailable) {
      const status = "SOA not yet available";
      const statusW = RIGHT_X - COL_X[2];
      const bank = overviewBankLabel(r);
      const card = overviewCardCell(r);
      const heights = overviewContentHeights(
        doc,
        [bank, card, status],
        [COL_W[0]!, COL_W[1]!, statusW],
      );
      const rowH = overviewRowHeightFromHeights(heights);
      y = ensureY(doc, y, rowH + 14);
      const rowTop = y;

      doc.fillColor("#111827");
      doc.text(bank, COL_X[0], vCenterTop(rowTop, rowH, heights[0]!), {
        width: COL_W[0],
      });
      doc.text(card, COL_X[1], vCenterTop(rowTop, rowH, heights[1]!), {
        width: COL_W[1],
      });
      doc
        .fillColor(MUTED)
        .text(status, COL_X[2], vCenterTop(rowTop, rowH, heights[2]!), {
          width: statusW,
        });
      doc.fillColor("#000000");

      y = rowTop + rowH;
      doc.moveTo(MARGIN, y).lineTo(RIGHT_X, y).stroke(LINE_SUBTLE);
      y += 6;
      continue;
    }

    const parts: [string, string, string, string, string, string, string] = [
      overviewBankLabel(r),
      overviewCardCell(r),
      r.minimumDue,
      r.totalDue,
      r.statementDate,
      r.dueDate,
      paidLabel(r),
    ];
    const heights = overviewContentHeights(doc, parts, [...COL_W]);
    const rowH = overviewRowHeightFromHeights(heights);
    y = ensureY(doc, y, rowH + 14);
    const rowTop = y;

    for (let i = 0; i < 7; i++) {
      doc.text(
        parts[i] ?? "",
        COL_X[i]!,
        vCenterTop(rowTop, rowH, heights[i]!),
        { width: COL_W[i]! },
      );
    }
    y = rowTop + rowH;
    doc.moveTo(MARGIN, y).lineTo(RIGHT_X, y).stroke(LINE_SUBTLE);
    y += 6;
  }

  const { sumMinimum, sumTotal, nMinimum, nTotal } = sumOverviewTotals(rows);
  y += 10;
  y = ensureY(doc, y, 56);

  doc.save();
  doc.lineWidth(1.35).strokeColor(GRAND_TOTAL_RULE);
  doc.moveTo(MARGIN, y).lineTo(RIGHT_X, y).stroke();
  doc.lineWidth(1).strokeColor("#000000");
  doc.restore();

  y += 6;

  const gtBarH = 34;
  y = ensureY(doc, y, gtBarH + 48);
  const gtTop = y;

  doc.save();
  doc.rect(MARGIN, gtTop, CONTENT_W, gtBarH).fill(GRAND_TOTAL_BG);
  doc.restore();

  const label = "Grand total";
  const labelInset = 10;
  const labelMaxW = COL_X[2] - MARGIN - labelInset;
  doc.font("Helvetica-Bold").fontSize(11).fillColor("#0f172a");
  const labelH = doc.heightOfString(label, { width: labelMaxW });
  doc.text(label, MARGIN + labelInset, vCenterTop(gtTop, gtBarH, labelH), {
    width: labelMaxW,
  });

  const minStr = nMinimum > 0 ? formatMoney(sumMinimum) : "—";
  const totStr = nTotal > 0 ? formatMoney(sumTotal) : "—";
  doc.font("Helvetica-Bold").fontSize(10).fillColor("#0f172a");
  const hMin = doc.heightOfString(minStr, { width: COL_W[2] });
  doc.text(minStr, COL_X[2], vCenterTop(gtTop, gtBarH, hMin), {
    width: COL_W[2],
    align: "right",
  });
  const hTot = doc.heightOfString(totStr, { width: COL_W[3] });
  doc.text(totStr, COL_X[3], vCenterTop(gtTop, gtBarH, hTot), {
    width: COL_W[3],
    align: "right",
  });

  doc.font("Helvetica").fontSize(9).fillColor("#94a3b8");
  for (const ci of [4, 5, 6] as const) {
    const dash = "—";
    const dh = doc.heightOfString(dash, { width: COL_W[ci]! });
    doc.text(dash, COL_X[ci]!, vCenterTop(gtTop, gtBarH, dh), {
      width: COL_W[ci]!,
    });
  }
  doc.fillColor("#000000").font("Helvetica");

  y = gtTop + gtBarH;
  doc.moveTo(MARGIN, y).lineTo(RIGHT_X, y).stroke(LINE_SUBTLE);

  return y + 24;
}

function drawConsolidatedFeeTable(
  doc: PdfDoc,
  y: number,
  rows: ConsolidatedFeeRow[],
  heading: string,
): number {
  y = ensureY(doc, y, 36);
  doc.save();
  doc.rect(MARGIN, y, CONTENT_W, 26).fill(SUBHEAD_BG);
  doc.restore();
  doc
    .font("Helvetica-Bold")
    .fontSize(10)
    .fillColor("#0f172a")
    .text(heading, MARGIN + 8, y + 7, {
      width: CONTENT_W - 16,
    });
  y += 34;

  const FX = [
    MARGIN,
    MARGIN + 68,
    MARGIN + 120,
    MARGIN + 200,
    MARGIN + 244,
    MARGIN + 442,
  ] as const;
  const FW = [68, 52, 80, 44, 198, 70] as const;
  const feeHeadH = 20;
  y = ensureY(doc, y, feeHeadH + 10);
  const fhTop = y;
  doc.save();
  doc.rect(MARGIN, fhTop, CONTENT_W, feeHeadH).fill(HEADER_BG);
  doc.restore();
  doc.font("Helvetica-Bold").fontSize(7).fillColor("#374151");
  const flabs = [
    "Month",
    "Bank",
    "Card",
    "Date",
    "Description",
    "Amt",
  ] as const;
  for (let i = 0; i < 6; i++) {
    const h = doc.heightOfString(flabs[i], { width: FW[i] });
    doc.text(flabs[i], FX[i], vCenterTop(fhTop, feeHeadH, h), {
      width: FW[i],
      align: i === 5 ? "right" : "left",
    });
  }
  y = fhTop + feeHeadH;
  doc.moveTo(MARGIN, y).lineTo(RIGHT_X, y).stroke(LINE);
  y += 6;
  doc.font("Helvetica").fontSize(7).fillColor("#000000");

  if (rows.length === 0) {
    y = ensureY(doc, y, 24);
    doc
      .font("Helvetica")
      .fontSize(9)
      .fillColor(MUTED)
      .text(
        "No fee / finance / penalty lines matched the reversal patterns for this scope.",
        MARGIN,
        y,
        { width: CONTENT_W },
      );
    y += 22;
    doc.fillColor("#000000");
    return y;
  }

  const PAD = 5;
  for (const fr of rows) {
    const parts = [
      fr.periodLabel,
      fr.bankLabel,
      fr.cardDisplay,
      fr.date,
      fr.description,
      fr.amount,
    ];
    const heights = parts.map((p, i) =>
      doc.heightOfString(p, { width: FW[i]! }),
    );
    const innerH = Math.max(...heights, 9);
    const rowH = innerH + PAD * 2;
    y = ensureY(doc, y, rowH + 4);
    const rowTop = y;

    doc.save();
    doc.rect(MARGIN, rowTop, CONTENT_W, rowH).fill(CHARGE_ALERT_BG);
    doc.restore();

    doc.fontSize(7).fillColor(CHARGE_ALERT_FG);
    for (let i = 0; i < 6; i++) {
      doc.text(parts[i] ?? "", FX[i], vCenterTop(rowTop, rowH, heights[i]!), {
        width: FW[i],
        align: i === 5 ? "right" : "left",
      });
    }
    doc.fillColor("#000000");

    y = rowTop + rowH;
    doc.moveTo(MARGIN, y).lineTo(RIGHT_X, y).stroke(LINE_SUBTLE);
  }

  return y + 8;
}

/**
 * Cover-page summary table for range PDFs.
 *
 * Rows = periods (months). Columns = card (bank label only, no card number),
 * plus a Total Due and Min Due summary column. Grand total row at the bottom.
 */
function drawRangeCoverSummary(
  doc: PdfDoc,
  sections: RangeMonthSection[],
): void {
  const COVER_HEADER_BG = "#1e3a5f";
  const COVER_HEADER_FG = "#ffffff";
  const ALT_ROW_BG = "#f8fafc";

  // Collect unique cards in first-appearance order (bank label only, no PAN).
  type CardKey = string; // `${issuerId}||${last4}`
  const cardOrder: CardKey[] = [];
  const cardLabels: Map<CardKey, string> = new Map();
  for (const s of sections) {
    for (const r of s.rows) {
      if (isSoaUnavailable(r)) continue;
      const key: CardKey = `${r.issuerId}||${r.cardLast4}`;
      if (!cardLabels.has(key)) {
        cardOrder.push(key);
        cardLabels.set(key, overviewBankLabel(r));
      }
    }
  }

  // Build lookup: periodLabel → cardKey → { totalDue, minimumDue }.
  type CellAmt = { totalDue: number | null; minimumDue: number | null };
  const data: Map<string, Map<CardKey, CellAmt>> = new Map();
  for (const s of sections) {
    const periodMap: Map<CardKey, CellAmt> = new Map();
    for (const r of s.rows) {
      if (isSoaUnavailable(r)) continue;
      const key: CardKey = `${r.issuerId}||${r.cardLast4}`;
      periodMap.set(key, {
        totalDue: parsePesoAmount(r.totalDue),
        minimumDue: parsePesoAmount(r.minimumDue),
      });
    }
    data.set(s.periodLabel, periodMap);
  }

  // ── Column layout ──────────────────────────────────────────────────────────
  const nCards = cardOrder.length;
  const PERIOD_W = 65;
  const TOTAL_W = 70;
  const MIN_W = 65;
  const cardColW =
    nCards > 0
      ? Math.floor((CONTENT_W - PERIOD_W - TOTAL_W - MIN_W) / nCards)
      : CONTENT_W - PERIOD_W - TOTAL_W - MIN_W;

  const COL_PERIOD_X = MARGIN;
  const COL_CARD_X = (ci: number) => MARGIN + PERIOD_W + ci * cardColW;
  const COL_TOTAL_X = MARGIN + PERIOD_W + nCards * cardColW;
  const COL_MIN_X = COL_TOTAL_X + TOTAL_W;

  const INNER = 4; // padding inside each cell
  const DATA_ROW_H = 26;
  const FOOTER_H = 30;

  let y = doc.y + 20;

  // ── Section heading ────────────────────────────────────────────────────────
  doc.font("Helvetica-Bold").fontSize(13).fillColor("#111827");
  doc.text("Range Overview", MARGIN, y, { width: CONTENT_W });
  y = doc.y + 10;

  // ── Measure header height (card labels may wrap) ───────────────────────────
  doc.font("Helvetica-Bold").fontSize(7.5);
  let maxLabelH = doc.heightOfString("Period", { width: PERIOD_W - INNER });
  for (let ci = 0; ci < nCards; ci++) {
    const label = cardLabels.get(cardOrder[ci]!)!;
    const h = doc.heightOfString(label, { width: cardColW - INNER });
    if (h > maxLabelH) maxLabelH = h;
  }
  const HEADER_H = Math.max(30, maxLabelH + 14);

  // ── Header row ─────────────────────────────────────────────────────────────
  y = ensureY(doc, y, HEADER_H + 4);
  doc.save();
  doc.rect(MARGIN, y, CONTENT_W, HEADER_H).fill(COVER_HEADER_BG);
  doc.restore();
  doc.font("Helvetica-Bold").fontSize(7.5).fillColor(COVER_HEADER_FG);

  const hY = (h: number) => vCenterTop(y, HEADER_H, h);

  // Period column header
  const periodLabelH = doc.heightOfString("Period", {
    width: PERIOD_W - INNER,
  });
  doc.text("Period", COL_PERIOD_X + INNER, hY(periodLabelH), {
    width: PERIOD_W - INNER,
  });

  // Card column headers (bank label only)
  for (let ci = 0; ci < nCards; ci++) {
    const label = cardLabels.get(cardOrder[ci]!)!;
    const w = cardColW - INNER;
    const lh = doc.heightOfString(label, { width: w });
    doc.text(label, COL_CARD_X(ci) + INNER, hY(lh), {
      width: w,
      align: "right",
    });
  }

  // Total Due / Min Due headers
  const totHdrH = doc.heightOfString("Total due", { width: TOTAL_W - INNER });
  doc.text("Total due", COL_TOTAL_X + INNER, hY(totHdrH), {
    width: TOTAL_W - INNER,
    align: "right",
  });
  const minHdrH = doc.heightOfString("Min due", { width: MIN_W - INNER });
  doc.text("Min due", COL_MIN_X + INNER, hY(minHdrH), {
    width: MIN_W - INNER,
    align: "right",
  });

  doc.fillColor("#000000").font("Helvetica");
  y += HEADER_H;
  doc.moveTo(MARGIN, y).lineTo(RIGHT_X, y).stroke(LINE);
  y += 4;

  // ── Data rows (one per period) ─────────────────────────────────────────────
  // Accumulators for grand-total row
  const cardGrandTotals: number[] = Array(nCards).fill(0) as number[];
  let grandTotal = 0;
  let grandMin = 0;

  for (let si = 0; si < sections.length; si++) {
    const s = sections[si]!;
    const periodMap = data.get(s.periodLabel) ?? new Map<CardKey, CellAmt>();

    y = ensureY(doc, y, DATA_ROW_H + 2);
    if (si % 2 === 1) {
      doc.save();
      doc.rect(MARGIN, y, CONTENT_W, DATA_ROW_H).fill(ALT_ROW_BG);
      doc.restore();
    }

    doc.font("Helvetica").fontSize(8.5).fillColor("#111827");

    // Period label (left-aligned)
    const pLabelH = doc.heightOfString(s.periodLabel, {
      width: PERIOD_W - INNER,
    });
    doc.text(
      s.periodLabel,
      COL_PERIOD_X + INNER,
      vCenterTop(y, DATA_ROW_H, pLabelH),
      {
        width: PERIOD_W - INNER,
      },
    );

    let rowTotal = 0;
    let rowMin = 0;

    for (let ci = 0; ci < nCards; ci++) {
      const key = cardOrder[ci]!;
      const cell = periodMap.get(key);
      const tot = cell?.totalDue ?? null;
      const minn = cell?.minimumDue ?? null;
      const w = cardColW - INNER;
      const val = tot !== null ? formatMoney(tot) : "—";
      doc
        .fillColor(tot !== null ? "#111827" : "#94a3b8")
        .text(
          val,
          COL_CARD_X(ci) + INNER,
          vCenterTop(y, DATA_ROW_H, doc.heightOfString(val, { width: w })),
          { width: w, align: "right" },
        );
      if (tot !== null) {
        rowTotal += tot;
        cardGrandTotals[ci] = (cardGrandTotals[ci] ?? 0) + tot;
      }
      if (minn !== null) rowMin += minn;
    }

    grandTotal += rowTotal;
    grandMin += rowMin;

    // Row totals (bold)
    doc.font("Helvetica-Bold").fontSize(8.5).fillColor("#0f172a");
    const totStr = rowTotal > 0 ? formatMoney(rowTotal) : "—";
    doc.text(
      totStr,
      COL_TOTAL_X + INNER,
      vCenterTop(
        y,
        DATA_ROW_H,
        doc.heightOfString(totStr, { width: TOTAL_W - INNER }),
      ),
      {
        width: TOTAL_W - INNER,
        align: "right",
      },
    );
    const minStr = rowMin > 0 ? formatMoney(rowMin) : "—";
    doc.text(
      minStr,
      COL_MIN_X + INNER,
      vCenterTop(
        y,
        DATA_ROW_H,
        doc.heightOfString(minStr, { width: MIN_W - INNER }),
      ),
      {
        width: MIN_W - INNER,
        align: "right",
      },
    );

    doc.font("Helvetica").fillColor("#000000");
    y += DATA_ROW_H;
    doc.moveTo(MARGIN, y).lineTo(RIGHT_X, y).stroke(LINE_SUBTLE);
    y += 3;
  }

  // ── Grand total row ────────────────────────────────────────────────────────
  y += 4;
  y = ensureY(doc, y, FOOTER_H + 4);
  doc.save();
  doc.lineWidth(1.2).strokeColor(GRAND_TOTAL_RULE);
  doc.moveTo(MARGIN, y).lineTo(RIGHT_X, y).stroke();
  doc.lineWidth(1).strokeColor("#000000");
  doc.restore();
  y += 4;

  doc.save();
  doc.rect(MARGIN, y, CONTENT_W, FOOTER_H).fill(GRAND_TOTAL_BG);
  doc.restore();

  doc.font("Helvetica-Bold").fontSize(9).fillColor("#0f172a");

  const gtLabelH = doc.heightOfString("Grand total", {
    width: PERIOD_W - INNER,
  });
  doc.text(
    "Grand total",
    COL_PERIOD_X + INNER,
    vCenterTop(y, FOOTER_H, gtLabelH),
    {
      width: PERIOD_W - INNER,
    },
  );

  for (let ci = 0; ci < nCards; ci++) {
    const val =
      (cardGrandTotals[ci] ?? 0) > 0 ? formatMoney(cardGrandTotals[ci]!) : "—";
    const w = cardColW - INNER;
    doc.text(
      val,
      COL_CARD_X(ci) + INNER,
      vCenterTop(y, FOOTER_H, doc.heightOfString(val, { width: w })),
      {
        width: w,
        align: "right",
      },
    );
  }

  const gtStr = grandTotal > 0 ? formatMoney(grandTotal) : "—";
  doc.text(
    gtStr,
    COL_TOTAL_X + INNER,
    vCenterTop(
      y,
      FOOTER_H,
      doc.heightOfString(gtStr, { width: TOTAL_W - INNER }),
    ),
    {
      width: TOTAL_W - INNER,
      align: "right",
    },
  );
  const gmStr = grandMin > 0 ? formatMoney(grandMin) : "—";
  doc.text(
    gmStr,
    COL_MIN_X + INNER,
    vCenterTop(
      y,
      FOOTER_H,
      doc.heightOfString(gmStr, { width: MIN_W - INNER }),
    ),
    {
      width: MIN_W - INNER,
      align: "right",
    },
  );

  doc.fillColor("#000000").font("Helvetica");
  y += FOOTER_H;
  doc.moveTo(MARGIN, y).lineTo(RIGHT_X, y).stroke(LINE);

  doc.font("Helvetica").fontSize(8).fillColor(MUTED);
  doc.text(
    "Total due per card per statement period. Each period page below shows the full breakdown.",
    MARGIN,
    y + 8,
    { width: CONTENT_W, align: "center" },
  );
}

/**
 * One PDF: cover summary table, then each calendar month on its own page (overview,
 * totals, full txn list, then that month’s reversal-request table). Ends with a
 * combined reversal-request table across all months.
 */
export async function writeRangeSummaryPdf(
  sections: RangeMonthSection[],
  outPath: string,
  title: string,
  resolvePaidLabel: (row: SoaRow) => string,
): Promise<void> {
  await fs.promises.mkdir(path.dirname(outPath), { recursive: true });

  const doc = new PDFDocument({ margin: MARGIN, size: "LETTER" });
  const stream = fs.createWriteStream(outPath);
  doc.pipe(stream);

  doc.font("Helvetica-Bold").fontSize(22).fillColor("#0f172a").text(title, {
    align: "center",
    width: CONTENT_W,
  });
  doc.moveDown(0.6);
  doc.moveTo(MARGIN, doc.y).lineTo(RIGHT_X, doc.y).stroke(LINE);

  drawRangeCoverSummary(doc, sections);

  const allFees = collectConsolidatedFeeRows(sections);
  const paidLabel = resolvePaidLabel;

  doc.addPage();

  for (let mi = 0; mi < sections.length; mi++) {
    if (mi > 0) doc.addPage();
    const s = sections[mi]!;
    let y = MARGIN;

    y = ensureY(doc, y, MONTH_BAND_H + 12);
    doc.save();
    doc.rect(MARGIN, y, CONTENT_W, MONTH_BAND_H).fill(MONTH_BAND_BG);
    doc.restore();
    doc
      .font("Helvetica-Bold")
      .fontSize(14)
      .fillColor(MONTH_BAND_FG)
      .text(s.periodLabel, MARGIN + 12, y + 9, { width: CONTENT_W - 24 });
    doc.fillColor("#000000").font("Helvetica");
    y += MONTH_BAND_H + 14;

    y = appendOverviewAndGrandTotal(doc, y, s.rows, paidLabel);
    y = appendTransactionBreakdownUnlimited(doc, y, s.rows);

    const monthFees = allFees.filter((f) => f.periodLabel === s.periodLabel);
    y += 16;
    y = ensureY(doc, y, 80);
    y = drawConsolidatedFeeTable(doc, y, monthFees, "Reversal-request charges");
  }

  doc.addPage();
  drawConsolidatedFeeTable(
    doc,
    MARGIN,
    allFees,
    "All reversal-request charges",
  );

  doc.end();
  await new Promise<void>((resolve, reject) => {
    stream.on("finish", resolve);
    stream.on("error", reject);
  });
}
