#!/usr/bin/env bun
/**
 * Idempotent local dev bootstrap for KameOps.
 *
 * Usage (from repo root):
 *   bun run setup:local           # install, docker, db push, seed
 *   bun run dev:local             # same + start Next.js dev server
 *
 * Options:
 *   --start     Start `bun run dev` after setup
 *   --skip-db   Skip db:push and db:seed (docker/env only)
 */

import { copyFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

import { commandExists, fail, log, parseEnvFile, run } from "./lib/setup-utils";

const ROOT = join(import.meta.dir, "..");
const WEB = join(ROOT, "apps/web");
const ENV_LOCAL = join(WEB, ".env.local");
const ENV_EXAMPLE = join(WEB, ".env.example");
const LOCAL_DEV_APP_URL = "http://localhost:3005";

const args = new Set(process.argv.slice(2));
const shouldStart = args.has("--start");
const skipDb = args.has("--skip-db");

function isLocalDatabaseUrl(url: string | undefined): boolean {
  if (!url) return true;
  try {
    const host = new URL(url.replace(/^postgresql:/, "http:")).hostname;
    return host === "localhost" || host === "127.0.0.1" || host === "::1";
  } catch {
    return false;
  }
}

function ensureEnvLocal(): void {
  if (existsSync(ENV_LOCAL)) {
    log("env", "apps/web/.env.local already exists");
    return;
  }
  if (!existsSync(ENV_EXAMPLE)) {
    fail("Missing apps/web/.env.example — cannot create .env.local");
  }
  copyFileSync(ENV_EXAMPLE, ENV_LOCAL);
  log("env", "Created apps/web/.env.local from .env.example");
}

function ensureDocker(): void {
  if (!commandExists("docker")) {
    fail(
      "Docker is not installed. Install Docker Desktop or point DATABASE_URL at Supabase in apps/web/.env.local",
    );
  }
  const info = spawnSync("docker", ["info"], { stdio: "pipe" });
  if (info.status !== 0) {
    fail(
      "Docker is installed but not running. Start Docker Desktop and retry.",
    );
  }
}

function startPostgres(): void {
  log("docker", "Starting Postgres (docker compose up -d postgres)");
  run("docker", ["compose", "up", "-d", "postgres"], ROOT);

  log("docker", "Waiting for Postgres to become healthy…");
  const maxAttempts = 30;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const health = spawnSync(
      "docker",
      ["inspect", "--format", "{{.State.Health.Status}}", "kame-ops-postgres"],
      { stdio: "pipe", encoding: "utf8" },
    );
    const status = health.stdout?.toString().trim();
    if (status === "healthy") {
      log("docker", "Postgres is ready");
      return;
    }

    const ready = spawnSync(
      "docker",
      [
        "compose",
        "exec",
        "-T",
        "postgres",
        "pg_isready",
        "-U",
        "postgres",
        "-d",
        "kame_ops",
      ],
      { cwd: ROOT, stdio: "pipe" },
    );
    if (ready.status === 0) {
      log("docker", "Postgres is ready");
      return;
    }

    if (attempt === maxAttempts) {
      fail(
        "Postgres did not become ready in time. Check: docker compose logs postgres",
      );
    }
    Bun.sleepSync(1000);
  }
}

function printSuccess(env: Record<string, string>): void {
  const appUrl = env.NEXT_PUBLIC_APP_URL ?? env.AUTH_URL ?? LOCAL_DEV_APP_URL;

  console.log("\n✓ Local setup complete\n");
  console.log(`  App:      ${appUrl}`);
  console.log(`  Sign in:  ${appUrl}/login (Google OAuth)`);
  console.log(
    "  Google:   Set GOOGLE_CLIENT_ID + GOOGLE_CLIENT_SECRET in apps/web/.env.local",
  );
  console.log("\n  Next time:");
  console.log(
    "    bun run dev          # dev server only (DB already running)",
  );
  console.log("    bun run setup:local  # re-run if schema/env changed");
  console.log("    bun run dev:local    # full bootstrap + dev server");
}

async function main(): Promise<void> {
  console.log("KameOps — local dev setup\n");

  ensureEnvLocal();

  const env = parseEnvFile(ENV_LOCAL);
  const databaseUrl = env.DATABASE_URL;
  const useLocalPostgres = isLocalDatabaseUrl(databaseUrl);

  log("install", "Installing dependencies (bun install)");
  run("bun", ["install"], ROOT);

  if (useLocalPostgres) {
    ensureDocker();
    startPostgres();
  } else {
    log(
      "docker",
      "Skipping Docker — DATABASE_URL is not localhost (remote Supabase/Postgres)",
    );
  }

  if (!skipDb) {
    log("database", "Applying schema (db:push)");
    run("bun", ["run", "db:push"], WEB);

    log("database", "Running db:seed (Google sign-in instructions)");
    run("bun", ["run", "db:seed"], WEB);
  }

  printSuccess(env);

  if (shouldStart) {
    log("dev", "Starting development server…");
    run("bun", ["run", "dev"], ROOT);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
