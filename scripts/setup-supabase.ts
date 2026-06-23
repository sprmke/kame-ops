#!/usr/bin/env bun
/**
 * Supabase bootstrap for KameOps (storage buckets + schema push).
 *
 * Prerequisites — set in apps/web/.env.local:
 *   DATABASE_URL, DIRECT_URL (recommended), SUPABASE_URL,
 *   SUPABASE_SERVICE_ROLE_KEY, SUPABASE_STORAGE_BUCKET_*
 *
 * Usage (repo root):
 *   bun run setup:supabase              # buckets + db:push
 *   bun run setup:supabase --storage    # buckets only
 *   bun run setup:supabase --db         # db:push only
 *   bun run setup:supabase --check      # verify env + connectivity
 */

import { existsSync } from "node:fs";
import { join } from "node:path";

import { fail, log, parseEnvFile, run } from "./lib/setup-utils";

const ROOT = join(import.meta.dir, "..");
const WEB = join(ROOT, "apps/web");
const ENV_LOCAL = join(WEB, ".env.local");

const args = new Set(process.argv.slice(2));
const storageOnly = args.has("--storage");
const dbOnly = args.has("--db");
const checkOnly = args.has("--check");
const runAll = !storageOnly && !dbOnly && !checkOnly;

function isSupabaseDatabase(url: string | undefined): boolean {
  if (!url) return false;
  return url.includes("supabase.co") || url.includes("supabase.com");
}

function supabaseStorageBase(url: string): string {
  return url.replace(/\/$/, "") + "/storage/v1";
}

async function storageRequest(
  env: Record<string, string>,
  path: string,
  init?: RequestInit,
): Promise<Response> {
  const base = supabaseStorageBase(env.SUPABASE_URL!);
  const key = env.SUPABASE_SERVICE_ROLE_KEY!;
  return fetch(`${base}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${key}`,
      apikey: key,
      "Content-Type": "application/json",
      ...init?.headers,
    },
  });
}

type StorageBucket = { name: string };

async function listBuckets(
  env: Record<string, string>,
): Promise<StorageBucket[]> {
  const res = await storageRequest(env, "/bucket");
  if (!res.ok) {
    const body = await res.text();
    fail(`Could not list storage buckets (${res.status}): ${body}`);
  }
  return (await res.json()) as StorageBucket[];
}

async function createBucket(
  env: Record<string, string>,
  name: string,
  isPublic: boolean,
): Promise<void> {
  const res = await storageRequest(env, "/bucket", {
    method: "POST",
    body: JSON.stringify({
      name,
      public: isPublic,
      file_size_limit: 10 * 1024 * 1024,
    }),
  });
  if (!res.ok) {
    const body = await res.text();
    fail(`Could not create bucket "${name}" (${res.status}): ${body}`);
  }
}

function runDbPush(): void {
  log("database", "Applying Drizzle schema (db:push)…");
  run("bun", ["run", "db:push"], WEB);
  log("database", "Schema applied");
}

async function ensureStorageBuckets(
  env: Record<string, string>,
): Promise<void> {
  const supabaseUrl = env.SUPABASE_URL;
  const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY;
  const privateBucket =
    env.SUPABASE_STORAGE_BUCKET_PRIVATE ?? "kame-ops-private";
  const publicBucket = env.SUPABASE_STORAGE_BUCKET_PUBLIC ?? "kame-ops-public";

  if (!supabaseUrl || !serviceKey) {
    fail(
      "Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in apps/web/.env.local",
    );
  }

  const existing = await listBuckets(env);
  const names = new Set(existing.map((b) => b.name));

  for (const [name, isPublic] of [
    [privateBucket, false],
    [publicBucket, true],
  ] as const) {
    if (names.has(name)) {
      log("storage", `Bucket "${name}" already exists`);
      continue;
    }
    await createBucket(env, name, isPublic);
    log("storage", `Created bucket "${name}" (public=${isPublic})`);
  }
}

async function checkConnectivity(env: Record<string, string>): Promise<void> {
  if (!env.DATABASE_URL) {
    fail("DATABASE_URL is not set in apps/web/.env.local");
  }

  if (!isSupabaseDatabase(env.DATABASE_URL)) {
    log(
      "check",
      "DATABASE_URL is not Supabase — still on local Docker Postgres?",
    );
  } else {
    log("check", "DATABASE_URL points at Supabase");
  }

  if (isSupabaseDatabase(env.DATABASE_URL) && !env.DIRECT_URL) {
    console.warn(
      "\n⚠ DIRECT_URL is not set. db:push may fail with the pooler URL (port 6543).",
    );
    console.warn(
      "  Add DIRECT_URL from Supabase → Settings → Database → Connection string → Session mode.",
    );
  }

  const required = [
    "SUPABASE_URL",
    "SUPABASE_SERVICE_ROLE_KEY",
    "SUPABASE_STORAGE_BUCKET_PRIVATE",
  ] as const;

  for (const key of required) {
    if (!env[key]) {
      fail(`Missing ${key} in apps/web/.env.local`);
    }
    log("check", `${key} is set`);
  }

  await listBuckets(env);
  log("check", "Supabase Storage API reachable");

  log("check", "All checks passed");
}

async function main(): Promise<void> {
  console.log("KameOps — Supabase setup\n");

  if (!existsSync(ENV_LOCAL)) {
    fail(
      "Missing apps/web/.env.local — copy from .env.example and add Supabase credentials first.",
    );
  }

  const env = parseEnvFile(ENV_LOCAL);

  if (checkOnly) {
    await checkConnectivity(env);
    return;
  }

  if (runAll || storageOnly) {
    await ensureStorageBuckets(env);
  }

  if (runAll || dbOnly) {
    if (!env.DATABASE_URL) {
      fail("DATABASE_URL is required for db:push");
    }
    runDbPush();
  }

  console.log("\n✓ Supabase setup complete\n");
  console.log("  Next: bun run dev → sign in → test SOA / receipt upload");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
