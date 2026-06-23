import { accessSync, constants } from "fs";
import { createRequire } from "module";
import { dirname, join } from "path";
import { fileURLToPath, pathToFileURL } from "url";

const legacyDir = dirname(fileURLToPath(import.meta.url));

function resolvePdfWorkerPath(): string {
  const vendored = join(legacyDir, "vendor/pdf.worker.mjs");
  try {
    accessSync(vendored, constants.R_OK);
    return vendored;
  } catch {
    /* vendored copy missing — fall back to node_modules (local dev) */
  }

  const require = createRequire(import.meta.url);
  const candidates = [
    "pdfjs-dist/legacy/build/pdf.worker.mjs",
    "pdfjs-dist/legacy/build/pdf.worker.min.mjs",
  ];
  for (const id of candidates) {
    try {
      const resolved = require.resolve(id);
      accessSync(resolved, constants.R_OK);
      return resolved;
    } catch {
      /* try next */
    }
  }

  throw new Error(
    "pdf.js worker not found. Run `bun run copy-pdf-worker` from apps/web.",
  );
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
