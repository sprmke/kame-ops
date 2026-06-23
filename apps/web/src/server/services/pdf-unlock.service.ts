import "server-only";

import { accessSync, constants } from "fs";
import { createRequire } from "module";
import { join } from "path";
import { readFile } from "fs/promises";

import type { CardCredential } from "@/server/legacy/pay-credit-cards/types";

type QpdfModule = {
  FS: {
    writeFile: (path: string, data: Uint8Array) => void;
    readFile: (path: string) => Uint8Array;
    unlink: (path: string) => void;
  };
  callMain: (args: string[]) => number;
};

const QPDF_WASM_RELATIVE =
  "src/server/legacy/pay-credit-cards/vendor/qpdf.wasm";

let qpdfModulePromise: Promise<QpdfModule> | null = null;
let resolvedQpdfWasmPath: string | null = null;

/** cwd-based path only — webpack breaks require.resolve() at build time. */
function resolveQpdfWasmPath(): string {
  if (resolvedQpdfWasmPath) return resolvedQpdfWasmPath;
  const candidates = [
    join(process.cwd(), QPDF_WASM_RELATIVE),
    join(process.cwd(), "apps/web", QPDF_WASM_RELATIVE),
  ];
  for (const candidate of candidates) {
    try {
      accessSync(candidate, constants.R_OK);
      resolvedQpdfWasmPath = candidate;
      return candidate;
    } catch {
      /* try next */
    }
  }
  throw new Error(
    "qpdf.wasm not found. Run `bun run copy-qpdf-wasm` from apps/web.",
  );
}

type QpdfFactory = (opts: {
  locateFile: (path: string, prefix?: string) => string;
  noInitialRun: boolean;
}) => Promise<QpdfModule>;

function loadQpdfFactory(): QpdfFactory {
  const require = createRequire(import.meta.url);
  return require("@neslinesli93/qpdf-wasm") as QpdfFactory;
}

async function getQpdfModule(): Promise<QpdfModule> {
  if (!qpdfModulePromise) {
    const wasmPath = resolveQpdfWasmPath();
    const createModule = loadQpdfFactory();
    qpdfModulePromise = createModule({
      locateFile: (path) => {
        if (path.endsWith(".wasm")) return wasmPath;
        return path;
      },
      noInitialRun: true,
    }).catch((err) => {
      qpdfModulePromise = null;
      throw err;
    });
  }
  return qpdfModulePromise;
}

export const UNLOCKED_PDF_PREFIX = "unlocked-";

export function unlockedPdfFileName(originalFileName: string): string {
  const base = originalFileName.replace(/^unlocked-/, "");
  return `${UNLOCKED_PDF_PREFIX}${base}`;
}

/**
 * Strip PDF user-password encryption. Returns a copy when already unencrypted.
 */
export async function decryptPdfBytes(
  encrypted: Uint8Array,
  password: string,
): Promise<Uint8Array> {
  const qpdf = await getQpdfModule();
  const token = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const inPath = `/unlock-in-${token}.pdf`;
  const outPath = `/unlock-out-${token}.pdf`;

  try {
    qpdf.FS.writeFile(inPath, encrypted);
    const exitCode = qpdf.callMain([
      `--password=${password}`,
      "--decrypt",
      inPath,
      outPath,
    ]);
    if (exitCode !== 0) {
      throw new Error(`PDF decrypt failed (exit ${exitCode})`);
    }
    return qpdf.FS.readFile(outPath);
  } finally {
    try {
      qpdf.FS.unlink(inPath);
    } catch {
      /* ignore */
    }
    try {
      qpdf.FS.unlink(outPath);
    } catch {
      /* ignore */
    }
  }
}

export async function decryptPdfFile(
  filePath: string,
  password: string,
): Promise<Buffer> {
  const encrypted = await readFile(filePath);
  const decrypted = await decryptPdfBytes(new Uint8Array(encrypted), password);
  return Buffer.from(decrypted);
}

export async function decryptPdfWithCredentials(
  encrypted: Uint8Array,
  credentials: CardCredential[],
): Promise<Uint8Array> {
  let lastErr: unknown;
  for (const cred of credentials) {
    try {
      return await decryptPdfBytes(encrypted, cred.password);
    } catch (e) {
      lastErr = e;
    }
  }
  throw new Error(
    `Could not decrypt PDF with configured card password(s): ${String(lastErr)}`,
  );
}

export async function writeUnlockedPdfCopy(
  sourcePath: string,
  password: string,
  destPath: string,
): Promise<void> {
  const { writeFile } = await import("fs/promises");
  const decrypted = await decryptPdfFile(sourcePath, password);
  await writeFile(destPath, decrypted);
}
