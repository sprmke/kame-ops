/**
 * pdfjs-dist expects browser canvas APIs and Node 22+ builtins.
 * Load before pdf.mjs is evaluated (Next.js server bundles, Vercel Node 20).
 */
import { getCanvasModule, isCanvasAvailable } from "@/server/lib/canvas-engine";

const globalScope = globalThis as Record<string, unknown>;

if (typeof process.getBuiltinModule !== "function") {
  process.getBuiltinModule = (name: string) => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return require(name);
  };
}

if (isCanvasAvailable()) {
  try {
    const canvas = getCanvasModule();
    if (typeof globalScope.DOMMatrix === "undefined") {
      globalScope.DOMMatrix = canvas.DOMMatrix;
    }
    if (typeof globalScope.ImageData === "undefined") {
      globalScope.ImageData = canvas.ImageData;
    }
    if (typeof globalScope.Path2D === "undefined") {
      globalScope.Path2D = canvas.Path2D;
    }
  } catch {
    /* canvas polyfill optional for text-only pdf.js paths */
  }
}
