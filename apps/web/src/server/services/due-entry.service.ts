import { and, eq } from "drizzle-orm";
import { TRPCError } from "@trpc/server";

import { db } from "@/lib/db";
import { dueEntries } from "@/lib/db/schema";
import { dueSyncService } from "./due-sync.service";
import { prepareLegacyRuntime } from "./legacy-runtime.service";

export const dueEntryService = {
  async markPaid(userId: string, dueEntryId: string) {
    const entry = await db.query.dueEntries.findFirst({
      where: and(eq(dueEntries.id, dueEntryId), eq(dueEntries.userId, userId)),
    });
    if (!entry) {
      throw new TRPCError({
        code: "NOT_FOUND",
        message: "Due entry not found",
      });
    }

    const workDir = await prepareLegacyRuntime(userId);
    const monthYM = entry.dueDateYmd.slice(0, 7);

    const { markCardPaid } =
      await import("@/server/legacy/pay-credit-cards/mark-paid");
    const result = await markCardPaid(entry.cardLast4, monthYM, false);

    if (!result.ok) {
      if (result.reason === "not_found") {
        await db
          .update(dueEntries)
          .set({ paidAt: new Date() })
          .where(eq(dueEntries.id, dueEntryId));
        await dueSyncService.syncFromLegacyFile(userId, workDir);
        return { ok: true, mode: "db_only" as const };
      }
      throw new TRPCError({
        code: "BAD_REQUEST",
        message:
          result.reason === "ambiguous"
            ? "Multiple cards match this last-4. Use a more specific entry."
            : "Could not mark as paid",
      });
    }

    await db
      .update(dueEntries)
      .set({ paidAt: new Date() })
      .where(eq(dueEntries.id, dueEntryId));

    await dueSyncService.syncFromLegacyFile(userId, workDir);
    return {
      ok: true,
      mode: "full" as const,
      remindersSuppressed: result.remindersSuppressed,
    };
  },

  async markUnpaid(userId: string, dueEntryId: string) {
    const entry = await db.query.dueEntries.findFirst({
      where: and(eq(dueEntries.id, dueEntryId), eq(dueEntries.userId, userId)),
    });
    if (!entry) {
      throw new TRPCError({
        code: "NOT_FOUND",
        message: "Due entry not found",
      });
    }

    const workDir = await prepareLegacyRuntime(userId);
    const monthYM = entry.dueDateYmd.slice(0, 7);

    const { markCardUnpaid } =
      await import("@/server/legacy/pay-credit-cards/mark-paid");
    const result = await markCardUnpaid(entry.cardLast4, monthYM, false);

    await db
      .update(dueEntries)
      .set({ paidAt: null, paidAmount: null })
      .where(eq(dueEntries.id, dueEntryId));

    await dueSyncService.syncFromLegacyFile(userId, workDir);

    if (!result.ok && result.reason === "not_found") {
      return { ok: true, mode: "db_only" as const };
    }

    return { ok: true, mode: "full" as const };
  },
};
