import { mkdir, writeFile } from "fs/promises";
import { join } from "path";
import { tmpdir } from "os";
import { eq } from "drizzle-orm";

import { db } from "@/lib/db";
import { dueEntries } from "@/lib/db/schema";
import { creditCardService } from "./credit-card.service";
import { applyIntegrationsToEnv } from "./integration-env.service";

export async function prepareLegacyRuntime(userId: string): Promise<string> {
  const cards = await creditCardService.listForLegacy(userId);
  const workDir = join(tmpdir(), `kame-ops-${userId}`);

  process.env.DATA_DIR = workDir;
  process.env.CARDS_JSON = JSON.stringify(cards);

  await applyIntegrationsToEnv(userId);
  await mkdir(workDir, { recursive: true });
  await mkdir(join(workDir, "downloads"), { recursive: true });
  await mkdir(join(workDir, "output"), { recursive: true });

  await syncDbDuesToLegacyFile(userId, workDir);

  return workDir;
}

async function syncDbDuesToLegacyFile(userId: string, workDir: string) {
  const dues = await db.query.dueEntries.findMany({
    where: eq(dueEntries.userId, userId),
  });

  const state = {
    version: 1,
    dues: dues.map((d) => ({
      issuerId: d.issuerId,
      cardLast4: d.cardLast4,
      bankLabel: d.bankLabel,
      cardDisplayLabel: d.cardDisplayLabel ?? undefined,
      fullPan: d.fullPan ?? undefined,
      dueDate: d.dueDate,
      dueDateYMD: d.dueDateYmd,
      minimumDue: d.minimumDue,
      totalDue: d.totalDue,
      interestCharges: d.interestCharges ?? undefined,
      contactLine: d.contactLine ?? undefined,
      updatedAt: d.updatedAt.toISOString(),
      ...(d.paidAt ? { paidAt: d.paidAt.toISOString() } : {}),
    })),
    sent: {},
  };

  await writeFile(
    join(workDir, "due-reminders-state.json"),
    JSON.stringify(state, null, 2),
  );
}
