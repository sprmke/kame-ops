// @ts-nocheck
import "./pdf-node-polyfill";
import { createWorker, PSM } from "tesseract.js";
import { pdf } from "pdf-to-img";

export type BpiOcrOptions = {
  /** Max pages to OCR; `0` = entire PDF. */
  maxPages: number;
  /** Render scale for rasterization (higher = sharper, slower). */
  scale: number;
  /** Tesseract page segmentation mode (string "0"–"13"). */
  psm: PSM;
  /** Append a second pass with sparse layout (helps when labels are scattered). */
  dualSparse: boolean;
};

const PSM_VALUES = new Set<string>(Object.values(PSM));

export function parseBpiPsmEnv(raw: string | undefined): PSM {
  const t = raw?.trim() ?? "";
  if (t && PSM_VALUES.has(t)) return t as PSM;
  return PSM.AUTO;
}

/** Fixes common OCR quirks before regex parsing. */
function normalizeBpiOcrChunk(s: string): string {
  return s
    .replace(/\uFF1A/g, ":")
    .replace(/P\s+H\s+P/gi, "PHP")
    .replace(/(\d),\s+(\d{3})/g, "$1,$2");
}

async function recognizeWithPsm(
  worker: Awaited<ReturnType<typeof createWorker>>,
  pageBuf: Buffer,
  psm: PSM,
): Promise<string> {
  await worker.setParameters({
    tessedit_pageseg_mode: psm,
    preserve_interword_spaces: "1",
  });
  const { data } = await worker.recognize(pageBuf);
  return normalizeBpiOcrChunk(data.text?.trim() ?? "");
}

/**
 * Rasterize PDF pages to bitmaps (same idea as screenshot → OCR), then Tesseract.
 * For higher quality on disk, use Apple Preview / ocrmypdf and parse manually — see docs/SETUP.md.
 */
export async function ocrPdfToPlainText(
  pdfPath: string,
  password: string,
  options: BpiOcrOptions,
): Promise<string> {
  const { maxPages, scale, psm, dualSparse } = options;
  const doc = await pdf(pdfPath, { password, scale });
  const worker = await createWorker("eng");
  const parts: string[] = [];
  const limit = maxPages <= 0 ? Number.POSITIVE_INFINITY : maxPages;
  try {
    let n = 0;
    for await (const pageBuf of doc) {
      n++;
      if (n > limit) break;
      let chunk = await recognizeWithPsm(worker, pageBuf, psm);
      if (dualSparse && psm !== PSM.SPARSE_TEXT) {
        const sparse = await recognizeWithPsm(worker, pageBuf, PSM.SPARSE_TEXT);
        if (sparse) chunk = chunk ? `${chunk}\n${sparse}` : sparse;
      }
      if (chunk) parts.push(chunk);
    }
  } finally {
    await worker.terminate();
  }
  return parts.join("\n\n");
}
