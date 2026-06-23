import { accessSync, constants } from "fs";
import { dirname, join } from "path";
import { fileURLToPath, pathToFileURL } from "url";

const legacyDir = dirname(fileURLToPath(import.meta.url));
const vendoredWorkerPath = join(legacyDir, "vendor/pdf.worker.mjs");

function resolvePdfWorkerPath(): string {
  try {
    accessSync(vendoredWorkerPath, constants.R_OK);
    return vendoredWorkerPath;
  } catch {
    throw new Error(
      "pdf.js worker not found at vendor/pdf.worker.mjs. Run `bun run copy-pdf-worker` from apps/web.",
    );
  }
}

/** Must run once before pdf.js getDocument() (Vercel needs an on-disk worker path). */
export function configurePdfJsWorker(
  pdfjs: typeof import("pdfjs-dist/legacy/build/pdf.mjs"),
): void {
  if (pdfjs.GlobalWorkerOptions.workerSrc) return;
  pdfjs.GlobalWorkerOptions.workerSrc = pathToFileURL(
    resolvePdfWorkerPath(),
  ).href;
}
