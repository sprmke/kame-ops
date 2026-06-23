/**
 * pdfjs-dist expects browser canvas APIs. Load @napi-rs/canvas before pdf.mjs
 * is evaluated (including under Next.js/Turbopack server bundles).
 * Optional on serverless — pdf.js still runs without it (text quality may vary).
 */
const globalScope = globalThis as Record<string, unknown>;

try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const canvas = require("@napi-rs/canvas") as typeof import("@napi-rs/canvas");
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
  /* @napi-rs/canvas native binary missing for this platform — pdf.js continues */
}
