import { desc, eq } from "drizzle-orm";

import { db } from "@/lib/db";
import { soaStatements } from "@/lib/db/schema";
import { creditCardService } from "./credit-card.service";
import { dueSyncService } from "./due-sync.service";
import { prepareLegacyRuntime } from "./legacy-runtime.service";
import { soaPersistService } from "./soa-persist.service";

export const soaService = {
  async listStatements(userId: string, limit = 50) {
    return db.query.soaStatements.findMany({
      where: eq(soaStatements.userId, userId),
      orderBy: [desc(soaStatements.createdAt)],
      limit,
      with: { transactions: true },
    });
  },

  async runSoaPipeline(
    userId: string,
    options?: { month?: number; year?: number },
  ) {
    const cards = await creditCardService.listForLegacy(userId);
    if (!cards.length) {
      return { ok: false, message: "No credit cards configured" };
    }

    const workDir = await prepareLegacyRuntime(userId);

    const now = new Date();
    const month = options?.month ?? now.getMonth() + 1;
    const year = options?.year ?? now.getFullYear();

    const { runSoa } = await import("@/server/legacy/pay-credit-cards/soa-run");
    const rows = await runSoa({
      mode: "single",
      month: String(month),
      year: String(year),
      skipNotify: false,
      skipBanner: true,
    });

    const sync = await dueSyncService.syncFromLegacyFile(userId, workDir);
    const persisted = await soaPersistService.persistRows(userId, rows, {
      month,
      year,
    });

    return { ok: true, rowCount: rows.length, sync, persisted };
  },

  async pollNewSoaFromGmail(userId: string) {
    const cards = await creditCardService.listForLegacy(userId);
    if (!cards.length) {
      return { ok: false, message: "No credit cards configured" };
    }

    const workDir = await prepareLegacyRuntime(userId);

    try {
      const { pollNewSoaFromGmail } =
        await import("@/server/legacy/pay-credit-cards/gmail-poll-new-soa");
      await pollNewSoaFromGmail();
    } catch {
      const now = new Date();
      const { runSoa } =
        await import("@/server/legacy/pay-credit-cards/soa-run");
      await runSoa({
        mode: "single",
        month: String(now.getMonth() + 1),
        year: String(now.getFullYear()),
        skipNotify: false,
        skipBanner: true,
      });
    }

    const sync = await dueSyncService.syncFromLegacyFile(userId, workDir);
    return { ok: true, sync };
  },
};
