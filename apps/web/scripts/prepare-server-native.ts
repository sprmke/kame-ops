/**
 * Copy pdf.js worker + qpdf wasm next to server lib code for Vercel file tracing.
 */
import { createRequire } from "module";
import { copyFileSync, mkdirSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const outDir = join(scriptDir, "../src/server/lib/native");

mkdirSync(outDir, { recursive: true });

const require = createRequire(join(scriptDir, "../package.json"));

const assets = [
  {
    name: "pdf.worker.mjs",
    src: require.resolve("pdfjs-dist/legacy/build/pdf.worker.mjs"),
  },
  {
    name: "qpdf.wasm",
    src: require.resolve("@neslinesli93/qpdf-wasm/dist/qpdf.wasm"),
  },
];

for (const { name, src } of assets) {
  const dest = join(outDir, name);
  copyFileSync(src, dest);
  console.log(`Prepared ${name} → ${dest}`);
}
