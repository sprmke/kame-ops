import { accessSync, constants } from "fs";
import { dirname, join } from "path";
import { fileURLToPath, pathToFileURL } from "url";

const VENDOR_RELATIVE =
  "src/server/legacy/pay-credit-cards/vendor/pdf.worker.mjs";

const legacyDir = dirname(fileURLToPath(import.meta.url));

declare global {
  // pdf.js reads this to avoid dynamic import() in Node fake-worker mode
  var pdfjsWorker: { WorkerMessageHandler?: unknown } | undefined;
}

/** Resolve vendored worker on disk (cwd-based for Vercel; legacyDir for local ts). */
export function resolvePdfWorkerPath(): string {
  const candidates = [
    join(process.cwd(), VENDOR_RELATIVE),
    join(process.cwd(), "apps/web", VENDOR_RELATIVE),
    join(legacyDir, "vendor/pdf.worker.mjs"),
  ];
  for (const candidate of candidates) {
    try {
      accessSync(candidate, constants.R_OK);
      return candidate;
    } catch {
      /* try next */
    }
  }
  throw new Error(
    "pdf.js worker not found. Run `bun run copy-pdf-worker` from apps/web.",
  );
}

let workerReadyPromise: Promise<void> | null = null;

/**
 * Configure pdf.js for Node/serverless:
 * 1. Point workerSrc at vendored file (NOT ./pdf.worker.mjs beside node_modules pdf.mjs)
 * 2. Preload WorkerMessageHandler on globalThis so pdf.js skips dynamic import()
 */
export function ensurePdfJsWorkerReady(
  pdfjs: typeof import("pdfjs-dist/legacy/build/pdf.mjs"),
): Promise<void> {
  if (!workerReadyPromise) {
    workerReadyPromise = (async () => {
      const workerPath = resolvePdfWorkerPath();
      const workerUrl = pathToFileURL(workerPath).href;
      pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;

      if (!globalThis.pdfjsWorker?.WorkerMessageHandler) {
        const worker = await import(/* webpackIgnore: true */ workerUrl);
        globalThis.pdfjsWorker = worker;
      }

      console.info(
        "[soa] pdf-worker-ready",
        JSON.stringify({ workerPath, workerUrl }),
      );
    })().catch((err) => {
      workerReadyPromise = null;
      throw err;
    });
  }
  return workerReadyPromise;
}

/** Sync probe for diagnostics / preflight (no import). */
export function getPdfWorkerDiagnostics():
  | { ok: true; workerPath: string; workerSrc: string }
  | { ok: false; error: string } {
  try {
    const workerPath = resolvePdfWorkerPath();
    return {
      ok: true,
      workerPath,
      workerSrc: pathToFileURL(workerPath).href,
    };
  } catch (e) {
    return { ok: false, error: String(e) };
  }
}
