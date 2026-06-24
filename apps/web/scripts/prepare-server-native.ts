/**
 * Copy native binaries next to server lib for Vercel file tracing.
 * Runtime loads packages via webpackIgnore; wasm is read from this folder.
 */
import { createRequire } from "node:module";
import { copyFileSync, mkdirSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const appRoot = join(scriptDir, "..");
const outDir = join(appRoot, "src/server/lib/native");

mkdirSync(outDir, { recursive: true });

const require = createRequire(join(appRoot, "package.json"));

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
