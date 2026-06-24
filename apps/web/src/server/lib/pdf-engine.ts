import "server-only";

import "@/server/legacy/pay-credit-cards/pdf-node-polyfill";

declare global {
  var pdfjsWorker: { WorkerMessageHandler?: unknown } | undefined;
}

type PdfJs = typeof import("pdfjs-dist/legacy/build/pdf.mjs");

let pdfJsPromise: Promise<PdfJs> | null = null;

export function getPdfJs(): Promise<PdfJs> {
  if (!pdfJsPromise) {
    pdfJsPromise = initPdfJs().catch((err) => {
      pdfJsPromise = null;
      throw err;
    });
  }
  return pdfJsPromise;
}

async function initPdfJs(): Promise<PdfJs> {
  const [pdfjs, worker] = await Promise.all([
    import(/* webpackIgnore: true */ "pdfjs-dist/legacy/build/pdf.mjs"),
    import(/* webpackIgnore: true */ "pdfjs-dist/legacy/build/pdf.worker.mjs"),
  ]);

  globalThis.pdfjsWorker = worker;
  pdfjs.GlobalWorkerOptions.workerSrc =
    "pdfjs-dist/legacy/build/pdf.worker.mjs";

  return pdfjs;
}

export type PdfEngineStatus = { ok: true } | { ok: false; error: string };

export async function checkPdfEngineReady(): Promise<PdfEngineStatus> {
  try {
    await getPdfJs();
    return { ok: true };
  } catch (e) {
    const error = e instanceof Error ? e.message : String(e);
    console.error("[pdf-engine] init failed:", error);
    return { ok: false, error };
  }
}
