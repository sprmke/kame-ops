/**
 * Simulates Vercel production locally:
 * - production Next.js build (webpack server bundles)
 * - NODE_ENV=production + VERCEL=1
 * - hits /api/health/engines through the same code path as SOA preflight
 *
 * Usage: bun run verify:prod-engines
 * Optional: VERIFY_PORT=3099 SKIP_BUILD=1 bun run verify:prod-engines
 */
import { type ChildProcess, spawn } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const appRoot = join(fileURLToPath(import.meta.url), "..", "..");
const port = Number(process.env.VERIFY_PORT ?? "3099");
const skipBuild = process.env.SKIP_BUILD === "1";

const REQUIRED_TRACE_SUFFIXES = ["src/server/lib/native/qpdf.wasm"];

type EngineHealth = {
  pdfEngineOk: boolean;
  qpdfEngineOk: boolean;
  pdfEngineError: string | null;
  qpdfEngineError: string | null;
  nodeEnv: string;
  vercel: boolean;
  cwd: string;
};

function run(
  cmd: string,
  args: string[],
  env?: NodeJS.ProcessEnv,
): Promise<number> {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, {
      cwd: appRoot,
      env: { ...process.env, ...env },
      stdio: "inherit",
    });
    child.on("error", reject);
    child.on("close", (code) => resolve(code ?? 1));
  });
}

function assertTraceExcludesBunStore(): void {
  const nftPath = join(
    appRoot,
    ".next/server/app/api/trpc/[trpc]/route.js.nft.json",
  );
  if (!existsSync(nftPath)) return;

  const nft = JSON.parse(readFileSync(nftPath, "utf8")) as { files: string[] };
  const bunPaths = nft.files.filter((file) =>
    file.includes("node_modules/.bun"),
  );
  if (bunPaths.length > 0) {
    console.warn(
      `⚠ Trace includes ${bunPaths.length} node_modules/.bun paths (Vercel deploy may fail).`,
    );
    console.warn(
      "  Vercel uses `bun install --linker hoisted` — run that locally to match production.",
    );
    return;
  }
  console.log("✓ tRPC trace has no node_modules/.bun symlinks");
}

function assertTraceIncludesNativeAssets(): void {
  const nftPath = join(
    appRoot,
    ".next/server/app/api/trpc/[trpc]/route.js.nft.json",
  );
  if (!existsSync(nftPath)) {
    throw new Error(
      `Missing ${nftPath}. Run \`bun run build\` from apps/web first.`,
    );
  }

  const nft = JSON.parse(readFileSync(nftPath, "utf8")) as { files: string[] };
  const missing = REQUIRED_TRACE_SUFFIXES.filter(
    (suffix) => !nft.files.some((file) => file.endsWith(suffix)),
  );
  if (missing.length > 0) {
    throw new Error(
      `Vercel trace would miss native assets: ${missing.join(", ")}`,
    );
  }
  console.log("✓ tRPC lambda trace includes native pdf/qpdf assets");
}

async function waitForHealth(
  url: string,
  timeoutMs: number,
): Promise<EngineHealth> {
  const started = Date.now();
  let lastError = "server not ready";

  while (Date.now() - started < timeoutMs) {
    try {
      const res = await fetch(url);
      if (res.ok) {
        return (await res.json()) as EngineHealth;
      }
      lastError = `${res.status} ${await res.text()}`;
    } catch (e) {
      lastError = e instanceof Error ? e.message : String(e);
    }
    await new Promise((r) => setTimeout(r, 500));
  }

  throw new Error(`Timed out waiting for ${url}: ${lastError}`);
}

function stopServer(child: ChildProcess): void {
  if (!child.killed) {
    child.kill("SIGTERM");
  }
}

async function freePort(port: number): Promise<void> {
  try {
    const res = await run("sh", [
      "-c",
      `lsof -ti :${port} | xargs kill -9 2>/dev/null || true`,
    ]);
    if (res !== 0) return;
    await new Promise((r) => setTimeout(r, 300));
  } catch {
    /* lsof unavailable */
  }
}

async function main(): Promise<void> {
  console.log("Verifying production PDF engines (Vercel-like)…\n");

  await freePort(port);

  if (!skipBuild) {
    console.log("→ bun run build");
    const code = await run("bun", ["run", "build"]);
    if (code !== 0) process.exit(code);
  } else if (!existsSync(join(appRoot, ".next/BUILD_ID"))) {
    console.error("SKIP_BUILD=1 but .next is missing — run build first.");
    process.exit(1);
  }

  assertTraceIncludesNativeAssets();
  assertTraceExcludesBunStore();

  const env = {
    ...process.env,
    NODE_ENV: "production",
    VERCEL: "1",
    PORT: String(port),
  };

  console.log(`→ next start -p ${port} (NODE_ENV=production VERCEL=1)`);
  const server = spawn("bun", ["run", "next", "start", "-p", String(port)], {
    cwd: appRoot,
    env,
    stdio: ["ignore", "pipe", "pipe"],
  });

  const onSignal = () => {
    stopServer(server);
    process.exit(130);
  };
  process.on("SIGINT", onSignal);
  process.on("SIGTERM", onSignal);

  try {
    const health = await waitForHealth(
      `http://127.0.0.1:${port}/api/health/engines`,
      60_000,
    );

    console.log("\nEngine health:", JSON.stringify(health, null, 2));

    let failed = false;
    if (!health.pdfEngineOk) {
      console.error(`\n✗ pdf engine: ${health.pdfEngineError ?? "unknown"}`);
      failed = true;
    } else {
      console.log("\n✓ pdf engine ready");
    }

    if (!health.qpdfEngineOk) {
      console.warn(`⚠ qpdf engine: ${health.qpdfEngineError ?? "unknown"}`);
      console.warn("  (SOA parse only requires pdf.js; qpdf is optional)");
    } else {
      console.log("✓ qpdf engine ready");
    }

    if (failed) {
      console.error(
        "\nFix engines before pushing — this is the same check SOA preflight uses on Vercel.",
      );
      process.exit(1);
    }

    console.log(
      "\nSafe to push: production bundle initializes pdf.js successfully.",
    );
  } finally {
    stopServer(server);
    await freePort(port);
  }
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
