import "server-only";

import { accessSync } from "fs";
import { createRequire } from "module";
import { join } from "path";

/** createRequire anchored to app package.json (works on Vercel; not webpack chunk paths). */
export function createPackageRequire(): NodeRequire {
  const anchors = [
    join(process.cwd(), "package.json"),
    join(process.cwd(), "apps/web/package.json"),
  ];
  for (const anchor of anchors) {
    try {
      accessSync(anchor);
      return createRequire(anchor);
    } catch {
      /* try next */
    }
  }
  return createRequire(import.meta.url);
}
