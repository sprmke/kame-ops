import { access, readdir } from "fs/promises";
import { join } from "path";
import { tmpdir } from "os";

import { UNLOCKED_PDF_PREFIX } from "@/server/services/pdf-unlock.service";

/** Canonical per-user work dir (matches prepareSoaWorkdir). */
export function soaWorkDir(userId: string): string {
  return join(tmpdir(), `kame-ops-${userId}`);
}

/**
 * Candidate work dirs for SOA PDFs on disk (matches prepareSoaWorkdir).
 */
export function soaWorkDirCandidates(userId: string): string[] {
  const candidates: string[] = [];
  const add = (path: string) => {
    if (!candidates.includes(path)) candidates.push(path);
  };

  add(soaWorkDir(userId));
  add(join("/tmp", `kame-ops-${userId}`));
  if (process.env.DATA_DIR) add(process.env.DATA_DIR);

  return candidates;
}

export function soaPeriodKey(year: number, month: number): string {
  return `${year}-${String(month).padStart(2, "0")}`;
}

async function resolveDownloadedPdfPathInWorkDir(
  workDir: string,
  year: number,
  month: number,
  pdfFileName: string,
): Promise<string | null> {
  const key = soaPeriodKey(year, month);
  const dir = join(workDir, "downloads", key);

  const unlockedCandidate = pdfFileName.startsWith(UNLOCKED_PDF_PREFIX)
    ? pdfFileName
    : `${UNLOCKED_PDF_PREFIX}${pdfFileName}`;

  for (const name of [unlockedCandidate, pdfFileName]) {
    const candidate = join(dir, name);
    try {
      await access(candidate);
      return candidate;
    } catch {
      // try next
    }
  }

  try {
    const files = await readdir(dir);
    const bareName = pdfFileName.replace(/^unlocked-/, "");
    const matches = files.filter(
      (f) =>
        f === pdfFileName ||
        f === unlockedCandidate ||
        f === `${UNLOCKED_PDF_PREFIX}${bareName}` ||
        f.endsWith(`-${bareName}`) ||
        (bareName.endsWith(".pdf") && f.endsWith(bareName)),
    );
    const preferred =
      matches.find((f) => f.startsWith(UNLOCKED_PDF_PREFIX)) ?? matches[0];
    if (preferred) return join(dir, preferred);
  } catch {
    // downloads dir missing
  }

  return null;
}

/**
 * Resolve a downloaded SOA PDF on disk. DB rows may store either the full
 * on-disk name (`bank-msgIdx-attachment.pdf`) or the legacy bare attachment name.
 */
export async function resolveDownloadedPdfPath(
  userId: string,
  year: number,
  month: number,
  pdfFileName: string,
): Promise<string | null> {
  if (!pdfFileName || pdfFileName === "—") return null;

  for (const workDir of soaWorkDirCandidates(userId)) {
    const found = await resolveDownloadedPdfPathInWorkDir(
      workDir,
      year,
      month,
      pdfFileName,
    );
    if (found) return found;
  }

  return null;
}

export async function resolveMonthlySummaryPdfPath(
  userId: string,
  year: number,
  month: number,
): Promise<string | null> {
  const key = soaPeriodKey(year, month);
  const fileName = `soa-summary-${year}-${String(month).padStart(2, "0")}.pdf`;

  for (const workDir of soaWorkDirCandidates(userId)) {
    const localPath = join(workDir, "output", key, fileName);
    try {
      await access(localPath);
      return localPath;
    } catch {
      // try next candidate
    }
  }

  return null;
}

export async function resolveRangeSummaryPdfPath(
  userId: string,
  fromMonth: number,
  fromYear: number,
  toMonth: number,
  toYear: number,
): Promise<string | null> {
  const fromPadded = String(fromMonth).padStart(2, "0");
  const toPadded = String(toMonth).padStart(2, "0");
  const fileName = `soa-summary-range-${fromYear}-${fromPadded}-to-${toYear}-${toPadded}.pdf`;
  const rangeDir = `range-${fromYear}-${fromPadded}-to-${toYear}-${toPadded}`;

  for (const workDir of soaWorkDirCandidates(userId)) {
    const localPath = join(workDir, "output", rangeDir, fileName);
    try {
      await access(localPath);
      return localPath;
    } catch {
      // try next candidate
    }
  }

  return null;
}
