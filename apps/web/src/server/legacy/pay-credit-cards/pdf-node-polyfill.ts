/**
 * pdfjs-dist expects browser canvas APIs. Load @napi-rs/canvas before pdf.mjs
 * is evaluated (including under Next.js/Turbopack server bundles).
 */
import { DOMMatrix, ImageData, Path2D } from "@napi-rs/canvas";

const globalScope = globalThis as Record<string, unknown>;

if (typeof globalScope.DOMMatrix === "undefined") {
  globalScope.DOMMatrix = DOMMatrix;
}
if (typeof globalScope.ImageData === "undefined") {
  globalScope.ImageData = ImageData;
}
if (typeof globalScope.Path2D === "undefined") {
  globalScope.Path2D = Path2D;
}
