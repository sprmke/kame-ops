import { eq } from "drizzle-orm";

import { db } from "@/lib/db";
import { dueEntries } from "@/lib/db/schema";
import { dueSyncService } from "./due-sync.service";
import { prepareLegacyRuntime } from "./legacy-runtime.service";

export const reminderService = {
  async listDueEntries(userId: string, unpaidOnly = true) {
    const rows = await db.query.dueEntries.findMany({
      where: eq(dueEntries.userId, userId),
      orderBy: (t, { asc }) => [asc(t.dueDateYmd)],
    });
    if (!unpaidOnly) return rows;
    return rows.filter((r) => !r.paidAt);
  },

  async sendDueRemindersForUser(userId: string) {
    await prepareLegacyRuntime(userId);

    const { runSendReminders } =
      await import("@/server/legacy/pay-credit-cards/send-reminders");
    const result = await runSendReminders({ skipBanner: true });

    if (process.env.DATA_DIR) {
      await dueSyncService.syncFromLegacyFile(userId, process.env.DATA_DIR);
    }

    return result;
  },
};
