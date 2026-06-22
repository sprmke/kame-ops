import { mkdir, readFile, writeFile } from "fs/promises";
import { join } from "path";
import { tmpdir } from "os";
import { eq } from "drizzle-orm";

import { db } from "@/lib/db";
import { dueEntries } from "@/lib/db/schema";
import { creditCardService } from "./credit-card.service";
import { gmailService } from "./gmail.service";
import { applyIntegrationsToEnv } from "./integration-env.service";

export async function prepareLegacyRuntime(userId: string): Promise<string> {
  const cards = await creditCardService.listForLegacy(userId);
  const workDir = join(tmpdir(), `kame-ops-${userId}`);

  process.env.DATA_DIR = workDir;
  process.env.CARDS_JSON = JSON.stringify(cards);

  await applyIntegrationsToEnv(userId);
  await gmailService.applyTokensToEnv(userId);
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
  const cards = await creditCardService.list(userId);
  const cardByKey = new Map(
    cards.map((c) => [`${c.issuer.toLowerCase()}:${c.last4}`, c]),
  );

  const statePath = join(workDir, "due-reminders-state.json");
  let sent: Record<string, string> = {};
  try {
    const raw = await readFile(statePath, "utf8");
    const parsed = JSON.parse(raw) as { sent?: Record<string, string> };
    sent = parsed.sent ?? {};
  } catch {
    // fresh state file
  }

  const state = {
    version: 1,
    dues: dues.map((d) => {
      const card = cardByKey.get(`${d.issuerId.toLowerCase()}:${d.cardLast4}`);
      return {
        issuerId: d.issuerId,
        cardLast4: d.cardLast4,
        bankLabel: d.bankLabel,
        cardDisplayLabel: d.cardDisplayLabel ?? card?.label ?? undefined,
        fullPan: d.fullPan ?? card?.fullPan ?? undefined,
        dueDate: d.dueDate,
        dueDateYMD: d.dueDateYmd,
        minimumDue: d.minimumDue,
        totalDue: d.totalDue,
        interestCharges: d.interestCharges ?? undefined,
        contactLine: d.contactLine ?? card?.contactLine ?? undefined,
        reminderWindowDays: card?.reminderWindowDays ?? undefined,
        reminderIntervalMinutes: card?.reminderIntervalMinutes ?? 1440,
        updatedAt: d.updatedAt.toISOString(),
        ...(d.paidAt ? { paidAt: d.paidAt.toISOString() } : {}),
      };
    }),
    sent,
  };

  await writeFile(statePath, JSON.stringify(state, null, 2));
}
