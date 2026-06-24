import "server-only";

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

/**
 * qpdf-wasm via in-memory wasmBinary — avoids locateFile / require.resolve at
 * bundle time (webpack was inlining resolve() as a numeric module id on Vercel).
 */
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
  const { createRequire } = await import("module");
  const { readFileSync } = await import("fs");
  const require = createRequire(import.meta.url);

  const wasmPath = require.resolve("@neslinesli93/qpdf-wasm/dist/qpdf.wasm");
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
    return { ok: false, error: String(e) };
  }
}
