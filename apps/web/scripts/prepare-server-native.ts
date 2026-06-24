/**
 * Copy native binaries into src/server/lib/native for Vercel file tracing.
 */
import { createRequire } from "node:module";
import { copyFileSync, mkdirSync, readdirSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

const appRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const outDir = join(appRoot, "src/server/lib/native");

mkdirSync(outDir, { recursive: true });

const require = createRequire(join(appRoot, "package.json"));

const wasmSrc = require.resolve("@neslinesli93/qpdf-wasm/dist/qpdf.wasm");
const wasmDest = join(outDir, "qpdf.wasm");
copyFileSync(wasmSrc, wasmDest);
console.log(`Prepared qpdf.wasm → ${wasmDest}`);

try {
  const canvasPkgDir = dirname(
    require.resolve("@napi-rs/canvas-linux-x64-gnu/package.json"),
  );
  const nodeFile = readdirSync(canvasPkgDir).find((f) => f.endsWith(".node"));
  if (nodeFile) {
    const dest = join(outDir, "canvas.linux-x64-gnu.node");
    copyFileSync(join(canvasPkgDir, nodeFile), dest);
    console.log(`Prepared canvas.linux-x64-gnu.node → ${dest}`);
  }
} catch {
  /* optional — only present on Linux CI/Vercel builders */
}
