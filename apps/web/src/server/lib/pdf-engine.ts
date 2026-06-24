import "server-only";

import { pathToFileURL } from "url";

import "@/server/legacy/pay-credit-cards/pdf-node-polyfill";
import { resolveNativeAsset } from "@/server/lib/native-assets";
import { createPackageRequire } from "@/server/lib/package-require";

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
  const require = createPackageRequire();
  const pdfPath = require.resolve("pdfjs-dist/legacy/build/pdf.mjs");
  const workerPath = resolveNativeAsset("pdf.worker.mjs");

  const [pdfjs, worker] = await Promise.all([
    import(pathToFileURL(pdfPath).href),
    import(pathToFileURL(workerPath).href),
  ]);

  globalThis.pdfjsWorker = worker;
  pdfjs.GlobalWorkerOptions.workerSrc = pathToFileURL(workerPath).href;

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
