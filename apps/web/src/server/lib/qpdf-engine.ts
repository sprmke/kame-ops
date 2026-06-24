import "server-only";

import { readFileSync } from "fs";

import { resolveNativeAsset } from "@/server/lib/native-assets";
import { createPackageRequire } from "@/server/lib/package-require";

type QpdfModule = {
  FS: {
    writeFile: (path: string, data: Uint8Array) => void;
    readFile: (path: string) => Uint8Array;
    unlink: (path: string) => void;
  };
  callMain: (args: string[]) => number;
};

type QpdfFactory = (opts: {
  wasmBinary?: Uint8Array;
  noInitialRun: boolean;
}) => Promise<QpdfModule>;

let qpdfModulePromise: Promise<QpdfModule> | null = null;

export function getQpdfModule(): Promise<QpdfModule> {
  if (!qpdfModulePromise) {
    qpdfModulePromise = loadQpdfModule().catch((err) => {
      qpdfModulePromise = null;
      throw err;
    });
  }
  return qpdfModulePromise;
}

async function loadQpdfModule(): Promise<QpdfModule> {
  const require = createPackageRequire();
  const wasmPath = resolveNativeAsset("qpdf.wasm");
  const wasmBinary = readFileSync(wasmPath);
  const createModule = require("@neslinesli93/qpdf-wasm") as QpdfFactory;
  return createModule({ wasmBinary, noInitialRun: true });
}

export type QpdfEngineStatus = { ok: true } | { ok: false; error: string };

export async function checkQpdfEngineReady(): Promise<QpdfEngineStatus> {
  try {
    await getQpdfModule();
    return { ok: true };
  } catch (e) {
    const error = e instanceof Error ? e.message : String(e);
    console.error("[qpdf-engine] init failed:", error);
    return { ok: false, error };
  }
}
