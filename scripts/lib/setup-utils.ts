import { existsSync, readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";

export function log(step: string, message: string) {
  console.log(`\n▸ ${step}: ${message}`);
}

export function fail(message: string): never {
  console.error(`\n✗ ${message}`);
  process.exit(1);
}

export function run(command: string, commandArgs: string[], cwd: string): void {
  const result = spawnSync(command, commandArgs, {
    cwd,
    stdio: "inherit",
    shell: false,
  });
  if (result.status !== 0) {
    fail(`Command failed: ${command} ${commandArgs.join(" ")}`);
  }
}

export function commandExists(name: string): boolean {
  const result = spawnSync("which", [name], { stdio: "pipe" });
  return result.status === 0;
}

export function parseEnvFile(path: string): Record<string, string> {
  if (!existsSync(path)) return {};
  const env: Record<string, string> = {};
  for (const line of readFileSync(path, "utf8").split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    env[key] = value;
  }
  return env;
}
