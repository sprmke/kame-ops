import "server-only";

import { readFileSync } from "fs";

import { resolveNativeAsset } from "@/server/lib/native-assets";

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

function asQpdfFactory(mod: unknown): QpdfFactory {
  if (typeof mod === "function") return mod as QpdfFactory;
  if (
    mod &&
    typeof mod === "object" &&
    "default" in mod &&
    typeof (mod as { default: unknown }).default === "function"
  ) {
    return (mod as { default: QpdfFactory }).default;
  }
  throw new Error("qpdf-wasm module did not export a factory function");
}

async function loadQpdfModule(): Promise<QpdfModule> {
  const wasmBinary = readFileSync(resolveNativeAsset("qpdf.wasm"));

  const mod = await import(/* webpackIgnore: true */ "@neslinesli93/qpdf-wasm");
  const createModule = asQpdfFactory(mod);

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
