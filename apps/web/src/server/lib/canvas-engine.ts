import "server-only";

import { resolveNativeAsset } from "@/server/lib/native-assets";

export type CanvasModule = typeof import("@napi-rs/canvas");

let canvasModule: CanvasModule | null = null;
let canvasLoadAttempted = false;

function loadCanvasModule(): CanvasModule {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return require("@napi-rs/canvas") as CanvasModule;
  } catch {
    /* try vendored Linux binary (Vercel file trace) */
  }

  const nodePath = resolveNativeAsset("canvas.linux-x64-gnu.node");
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  return require(nodePath) as CanvasModule;
}

/** Node canvas for pdf.js render and BPI OCR rasterization. */
export function getCanvasModule(): CanvasModule {
  if (!canvasLoadAttempted) {
    canvasLoadAttempted = true;
    try {
      canvasModule = loadCanvasModule();
    } catch {
      canvasModule = null;
    }
  }
  if (!canvasModule) {
    throw new Error(
      "@napi-rs/canvas not available. Run `bun run prepare-server-native` before deploy.",
    );
  }
  return canvasModule;
}

export function isCanvasAvailable(): boolean {
  try {
    getCanvasModule();
    return true;
  } catch {
    return false;
  }
}

export type CanvasEngineStatus = { ok: true } | { ok: false; error: string };

export function checkCanvasEngineReady(): CanvasEngineStatus {
  try {
    getCanvasModule();
    return { ok: true };
  } catch (e) {
    const error = e instanceof Error ? e.message : String(e);
    return { ok: false, error };
  }
}
