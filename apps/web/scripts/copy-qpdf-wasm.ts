/**
 * Copy qpdf.wasm next to server legacy code so Vercel bundles it reliably.
 * Do NOT use require.resolve() in runtime code — webpack inlines it as a module id.
 */
import { createRequire } from "module";
import { copyFileSync, mkdirSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const outDir = join(scriptDir, "../src/server/legacy/pay-credit-cards/vendor");
const outPath = join(outDir, "qpdf.wasm");

mkdirSync(outDir, { recursive: true });

const require = createRequire(import.meta.url);
const pkgJson = require.resolve("@neslinesli93/qpdf-wasm/package.json");
const src = join(dirname(pkgJson), "dist", "qpdf.wasm");
copyFileSync(src, outPath);

console.log(`Copied qpdf.wasm → ${outPath}`);
