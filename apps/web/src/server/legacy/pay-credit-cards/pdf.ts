// @ts-nocheck
import fs from "node:fs";
import "./pdf-node-polyfill";
import * as pdfjs from "pdfjs-dist/legacy/build/pdf.mjs";
import { configurePdfJsWorker } from "./pdf-worker-setup";
import type { CardCredential } from "./types";

configurePdfJsWorker(pdfjs);

export type UnlockResult = {
  password: string;
  last4: string;
  text: string;
};

function normalizeText(items: string[]): string {
  return items.join("\n").replace(/\r\n/g, "\n");
}

/**
 * Copy PDF bytes into a new ArrayBuffer (not a Node pooled buffer view) so pdf.js
 * can postMessage them in Node without DataCloneError. Fresh copy per open attempt.
 */
function readPdfBinary(pdfPath: string): Uint8Array {
  const buf = fs.readFileSync(pdfPath);
  const ab = new ArrayBuffer(buf.length);
  new Uint8Array(ab).set(buf);
  return new Uint8Array(ab);
}

type PlacedStr = { str: string; x: number; y: number };

function textItemsToPlaced(content: { items: unknown[] }): PlacedStr[] {
  const out: PlacedStr[] = [];
  for (const raw of content.items) {
    if (!raw || typeof raw !== "object" || !("str" in raw)) continue;
    const item = raw as { str: string; transform?: number[] };
    const tr = item.transform;
    if (!Array.isArray(tr) || tr.length < 6) continue;
    const x = Number(tr[4]);
    const y = Number(tr[5]);
    if (!Number.isFinite(x) || !Number.isFinite(y)) continue;
    if (!item.str || !item.str.trim()) continue;
    out.push({ str: item.str, x, y });
  }
  return out;
}

/**
 * Cluster text items into visual rows (similar baseline y), then order left-to-right.
 * pdf.js stream order often interleaves table columns; this matches on-screen layout.
 */
function linesFromPlacedItems(
  items: PlacedStr[],
  yTol = 5,
  yDescending: boolean,
): string[] {
  if (items.length === 0) return [];
  const buckets = new Map<number, PlacedStr[]>();
  for (const it of items) {
    const key = Math.round(it.y / yTol) * yTol;
    let b = buckets.get(key);
    if (!b) {
      b = [];
      buckets.set(key, b);
    }
    b.push(it);
  }
  const ys = [...buckets.keys()].sort((a, b) => (yDescending ? b - a : a - b));
  const lines: string[] = [];
  for (const yk of ys) {
    const row = buckets.get(yk)!;
    row.sort((a, b) => a.x - b.x);
    const line = row
      .map((r) => r.str)
      .join(" ")
      .replace(/\s+/g, " ")
      .trim();
    if (line) lines.push(line);
  }
  return lines;
}

/**
 * One string per visual line, ordered top-to-bottom then left-to-right.
 * Use for RCBC (and similar) when naive stream concatenation mis-pairs table columns.
 */
export async function extractPdfLinesReadingOrder(
  pdfPath: string,
  password: string,
): Promise<string[]> {
  const [desc] = await extractPdfLinesReadingOrderDualAxis(pdfPath, password);
  return desc;
}

/**
 * Two full-document line lists: [higher-y-first, lower-y-first]. PDF y-axis direction
 * varies; RCBC txn parsing picks whichever yields a better row set.
 */
export async function extractPdfLinesReadingOrderDualAxis(
  pdfPath: string,
  password: string,
): Promise<[string[], string[]]> {
  const data = readPdfBinary(pdfPath);
  const loadingTask = pdfjs.getDocument({
    data,
    password,
    verbosity: 0,
    disableFontFace: true,
    isEvalSupported: false,
  });
  const doc = await loadingTask.promise;
  const linesYDesc: string[] = [];
  const linesYAsc: string[] = [];
  try {
    for (let p = 1; p <= doc.numPages; p++) {
      const page = await doc.getPage(p);
      const content = await page.getTextContent();
      const placed = textItemsToPlaced(content);
      linesYDesc.push(...linesFromPlacedItems(placed, 5, true));
      linesYAsc.push(...linesFromPlacedItems(placed, 5, false));
    }
  } finally {
    await doc.destroy();
  }
  return [linesYDesc, linesYAsc];
}

export async function tryUnlockAndExtractText(
  pdfPath: string,
  passwords: CardCredential[],
): Promise<UnlockResult> {
  let lastErr: unknown;

  for (const cred of passwords) {
    const data = readPdfBinary(pdfPath);
    const loadingTask = pdfjs.getDocument({
      data,
      password: cred.password,
      verbosity: 0,
      disableFontFace: true,
      isEvalSupported: false,
    });

    try {
      const doc = await loadingTask.promise;
      const pageTexts: string[] = [];
      for (let p = 1; p <= doc.numPages; p++) {
        const page = await doc.getPage(p);
        const content = await page.getTextContent();
        const chunks: string[] = [];
        for (const item of content.items) {
          if (!item || typeof item !== "object" || !("str" in item)) continue;
          const t = item as { str: string; hasEOL?: boolean };
          chunks.push(t.str);
          chunks.push(t.hasEOL ? "\n" : " ");
        }
        pageTexts.push(
          chunks
            .join("")
            .replace(/[ \t]+\n/g, "\n")
            .replace(/\n{3,}/g, "\n\n")
            .trim(),
        );
      }
      await doc.destroy();
      return {
        password: cred.password,
        last4: cred.last4,
        text: normalizeText(pageTexts),
      };
    } catch (e) {
      lastErr = e;
      try {
        await loadingTask.destroy();
      } catch {
        /* ignore */
      }
    }
  }

  throw new Error(
    `Could not open PDF with any configured password (${pdfPath}): ${String(lastErr)}`,
  );
}
