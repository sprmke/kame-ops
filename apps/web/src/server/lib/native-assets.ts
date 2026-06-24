import "server-only";

import { accessSync, constants } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

const NATIVE_RELATIVE = "src/server/lib/native";
const NATIVE_DIR = dirname(fileURLToPath(import.meta.url));

export function resolveNativeAsset(id: "qpdf.wasm"): string {
  const candidates = [
    join(NATIVE_DIR, "native", id),
    join(process.cwd(), NATIVE_RELATIVE, id),
    join(process.cwd(), "apps/web", NATIVE_RELATIVE, id),
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
    `${id} not found. Run \`bun run prepare-server-native\` from apps/web.`,
  );
}
