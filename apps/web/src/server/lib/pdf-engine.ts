import "server-only";

import "@/server/legacy/pay-credit-cards/pdf-node-polyfill";

declare global {
  // pdf.js Node fake-worker path reads this before importing workerSrc
  var pdfjsWorker: { WorkerMessageHandler?: unknown } | undefined;
}

type PdfJs = typeof import("pdfjs-dist/legacy/build/pdf.mjs");

let pdfJsPromise: Promise<PdfJs> | null = null;

/**
 * Lazy pdf.js for server (local + Vercel). Preloads WorkerMessageHandler on
 * globalThis so pdf.js never dynamic-imports a missing ./pdf.worker.mjs path.
 */
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
  // Override default "./pdf.worker.mjs" (truthy but wrong on serverless).
  pdfjs.GlobalWorkerOptions.workerSrc = "pdfjs-internal-worker";

  return pdfjs;
}

export type PdfEngineStatus = { ok: true } | { ok: false; error: string };

/** Preflight probe for SOA diagnostics. */
export async function checkPdfEngineReady(): Promise<PdfEngineStatus> {
  try {
    await getPdfJs();
    return { ok: true };
  } catch (e) {
    return { ok: false, error: String(e) };
  }
}
