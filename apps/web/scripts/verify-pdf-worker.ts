/**
 * Pre-deploy smoke test: vendored pdf.worker resolves and pdf.js fake worker starts.
 * Run from apps/web: bun run verify-pdf-worker
 */
import { accessSync } from "fs";
import { join } from "path";

import "../src/server/legacy/pay-credit-cards/pdf-node-polyfill.ts";
import * as pdfjs from "pdfjs-dist/legacy/build/pdf.mjs";
import {
  ensurePdfJsWorkerReady,
  resolvePdfWorkerPath,
} from "../src/server/legacy/pay-credit-cards/pdf-worker-setup.ts";

const workerPath = resolvePdfWorkerPath();
accessSync(workerPath);
console.log("resolvePdfWorkerPath:", workerPath);
console.log(
  "default workerSrc (bug if left unchanged):",
  pdfjs.GlobalWorkerOptions.workerSrc,
);

await ensurePdfJsWorkerReady(pdfjs);

if (pdfjs.GlobalWorkerOptions.workerSrc.startsWith("file:")) {
  console.log("workerSrc overridden:", pdfjs.GlobalWorkerOptions.workerSrc);
} else {
  console.error("FAIL: workerSrc not set to file:// URL");
  process.exit(1);
}

if (!globalThis.pdfjsWorker?.WorkerMessageHandler) {
  console.error("FAIL: globalThis.pdfjsWorker not preloaded");
  process.exit(1);
}
console.log("globalThis.pdfjsWorker preloaded");

const data = new Uint8Array([37, 80, 68, 70]);
try {
  await pdfjs.getDocument({ data, verbosity: 0, isEvalSupported: false })
    .promise;
} catch (e) {
  const msg = String((e as Error).message ?? e);
  if (msg.includes("fake worker failed")) {
    console.error("FAIL: fake worker failed:", msg);
    process.exit(1);
  }
  console.log("pdf.js worker OK (expected invalid PDF):", msg);
}

console.log("verify-pdf-worker: PASS");
