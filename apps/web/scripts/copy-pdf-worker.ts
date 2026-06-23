/**
 * Copy pdf.js worker next to server legacy code so Vercel bundles it reliably.
 * Bun's node_modules layout is not always fully traced by Next output file tracing.
 */
import { createRequire } from "module";
import { copyFileSync, mkdirSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const outDir = join(scriptDir, "../src/server/legacy/pay-credit-cards/vendor");
const outPath = join(outDir, "pdf.worker.mjs");

mkdirSync(outDir, { recursive: true });

const require = createRequire(import.meta.url);
const src = require.resolve("pdfjs-dist/legacy/build/pdf.worker.mjs");
copyFileSync(src, outPath);

console.log(`Copied pdf.worker.mjs → ${outPath}`);
