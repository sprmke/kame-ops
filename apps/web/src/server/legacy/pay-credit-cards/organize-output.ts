// @ts-nocheck
/**
 * Move summary PDFs and BPI OCR dumps from data/output/ into data/output/YYYY-MM/
 * (same layout as data/downloads/YYYY-MM/).
 *
 *   npm run organize-output
 */
import fs from "node:fs";
import path from "node:path";
import { projectPaths } from "./config";
import { log, logBanner } from "./logger";

/** e.g. soa-summary-2026-03.pdf, bpi-ocr-0018-2026-03.txt → 2026-03 */
export function inferPeriodFromOutputFileName(fileName: string): string | null {
  const m = fileName.match(/(20\d{2}-\d{2})\.(pdf|txt)$/i);
  return m?.[1] ?? null;
}

function main() {
  logBanner(
    "pay-credit-cards · Organize output",
    "PDFs / txt → data/output/YYYY-MM/"
  );
  log.header("Scan");

  const outRoot = path.join(projectPaths.dataDir, "output");
  if (!fs.existsSync(outRoot)) {
    log.error(`No output directory: ${outRoot}`);
    process.exit(1);
  }
  log.info(outRoot);

  const entries = fs.readdirSync(outRoot, { withFileTypes: true });
  let moved = 0;
  let skipped = 0;

  log.header("Files");
  for (const ent of entries) {
    if (!ent.isFile()) continue;
    const lower = ent.name.toLowerCase();
    if (!lower.endsWith(".pdf") && !lower.endsWith(".txt")) {
      skipped++;
      continue;
    }

    const period = inferPeriodFromOutputFileName(ent.name);
    if (!period) {
      log.warn(`Skip (no YYYY-MM before extension): ${ent.name}`);
      skipped++;
      continue;
    }

    const destDir = path.join(outRoot, period);
    fs.mkdirSync(destDir, { recursive: true });
    const from = path.join(outRoot, ent.name);
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
