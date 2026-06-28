import "server-only";

import { readFileSync } from "fs";

import { getCanvasModule } from "@/server/lib/canvas-engine";
import { getPdfJs } from "@/server/lib/pdf-engine";

function readPdfBinary(pdfPath: string): Uint8Array {
  const buf = readFileSync(pdfPath);
  const ab = new ArrayBuffer(buf.length);
  new Uint8Array(ab).set(buf);
  return new Uint8Array(ab);
}

/**
 * Rasterize PDF pages to PNG buffers (pdf.js + @napi-rs/canvas).
 * Replaces pdf-to-img so Vercel does not need pdfjs-dist/package.json resolution.
 */
export async function* rasterizePdfPages(
  pdfPath: string,
  password: string,
  scale: number,
  maxPages: number,
): AsyncGenerator<Buffer> {
  const pdfjs = await getPdfJs();
  const { createCanvas } = getCanvasModule();
  const data = readPdfBinary(pdfPath);
  const loadingTask = pdfjs.getDocument({
    data,
    password,
    verbosity: 0,
    disableFontFace: true,
    isEvalSupported: false,
  });

  const doc = await loadingTask.promise;
  const limit = maxPages <= 0 ? doc.numPages : Math.min(doc.numPages, maxPages);

  try {
    for (let pageNum = 1; pageNum <= limit; pageNum++) {
      const page = await doc.getPage(pageNum);
      const viewport = page.getViewport({ scale });
      const width = Math.ceil(viewport.width);
      const height = Math.ceil(viewport.height);
      const canvas = createCanvas(width, height);
      const context = canvas.getContext("2d");
      await page.render({
        canvas: canvas as unknown as HTMLCanvasElement,
        canvasContext: context as unknown as CanvasRenderingContext2D,
        viewport,
      }).promise;
      yield canvas.toBuffer("image/png");
    }
  } finally {
    await doc.destroy();
  }
}
