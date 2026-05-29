// @ts-nocheck
/**
 * One-time (or repeat-safe): move PDFs sitting directly under data/downloads/
 * into data/downloads/YYYY-MM/ using dates embedded in filenames.
 *
 *   npm run organize-downloads
 */
import fs from "node:fs";
import path from "node:path";
import { projectPaths } from "./config";
import { log, logBanner } from "./logger";

const MONTH_ABBR: Record<string, string> = {
  JAN: "01",
  FEB: "02",
  MAR: "03",
  APR: "04",
  MAY: "05",
  JUN: "06",
  JUL: "07",
  AUG: "08",
  SEP: "09",
  OCT: "10",
  NOV: "11",
  DEC: "12",
};

/** Returns folder key `YYYY-MM` or null. */
export function inferPeriodFromFileName(fileName: string): string | null {
  // Avoid leading \b: "_" is a "word" char in JS, so VISA_MAR would break \bMAR.
  const mmm = fileName.match(
    /(JAN|FEB|MAR|APR|MAY|JUN|JUL|AUG|SEP|OCT|NOV|DEC)_(\d{1,2})_(\d{4})/i
  );
  if (mmm) {
    const mon = MONTH_ABBR[mmm[1]!.toUpperCase()];
    if (mon) return `${mmm[3]}-${mon}`;
  }

  const end = fileName.match(/(20\d{2})(\d{2})(\d{2})\.pdf$/i);
  if (end) return `${end[1]}-${end[2]}`;

  const all = [...fileName.matchAll(/(20\d{2})(\d{2})(\d{2})/g)];
  if (all.length > 0) {
    const last = all[all.length - 1]!;
    return `${last[1]}-${last[2]}`;
  }

  return null;
}

function main() {
  logBanner("pay-credit-cards · Organize downloads", "PDFs → data/downloads/YYYY-MM/");
  log.header("Scan");

  const downloads = path.join(projectPaths.dataDir, "downloads");
  if (!fs.existsSync(downloads)) {
    log.error(`No downloads directory: ${downloads}`);
    process.exit(1);
  }
  log.info(downloads);

  const entries = fs.readdirSync(downloads, { withFileTypes: true });
  let moved = 0;
  let skipped = 0;

  log.header("Files");
  for (const ent of entries) {
    if (!ent.isFile()) continue;
    if (!ent.name.toLowerCase().endsWith(".pdf")) continue;

    const period = inferPeriodFromFileName(ent.name);
    if (!period) {
      log.warn(`Skip (no date in filename): ${ent.name}`);
      skipped++;
      continue;
    }

    const destDir = path.join(downloads, period);
    fs.mkdirSync(destDir, { recursive: true });
    const from = path.join(downloads, ent.name);
    const to = path.join(destDir, ent.name);
    if (fs.existsSync(to)) {
      log.warn(`Already exists, skip: ${to}`);
      skipped++;
      continue;
    }
    fs.renameSync(from, to);
    log.success(`${ent.name} → ${period}/`);
    moved++;
  }

  log.header("Summary");
  log.kv("Moved", String(moved));
  log.kv("Skipped", String(skipped));
}

main();
