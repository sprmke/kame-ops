import "server-only";

import { accessSync, constants } from "fs";
import { join } from "path";

import { createPackageRequire } from "./package-require";

const NATIVE_RELATIVE = "src/server/lib/native";

const BUILTINS = {
  "pdf.worker.mjs": "pdfjs-dist/legacy/build/pdf.worker.mjs",
  "qpdf.wasm": "@neslinesli93/qpdf-wasm/dist/qpdf.wasm",
} as const;

export type NativeAssetId = keyof typeof BUILTINS;

/** Resolve bundled native assets (Vercel) or node_modules (local dev). */
export function resolveNativeAsset(id: NativeAssetId): string {
  const bundledCandidates = [
    join(process.cwd(), NATIVE_RELATIVE, id),
    join(process.cwd(), "apps/web", NATIVE_RELATIVE, id),
  ];
  for (const candidate of bundledCandidates) {
    try {
      accessSync(candidate, constants.R_OK);
      return candidate;
    } catch {
      /* try next */
    }
  }

  const require = createPackageRequire();
  const resolved = require.resolve(BUILTINS[id]);
  accessSync(resolved, constants.R_OK);
  return resolved;
}
