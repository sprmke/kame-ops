import { TRPCError } from "@trpc/server";

import { DueActionProgressReporter } from "./due-action-progress.service";
import { markPaidService } from "./mark-paid.service";
import { deleteReceiptsForDueEntry } from "./receipt-cleanup.service";

export const dueEntryService = {
  async markPaid(userId: string, dueEntryId: string, processId?: string) {
    let reporter: DueActionProgressReporter | null = null;
    if (processId) {
      reporter = await DueActionProgressReporter.create(
        userId,
        processId,
        "mark_paid",
      );
      await reporter.activate("prepare", "Loading due entry");
    }

    try {
      await reporter?.completeStep("prepare");
      await reporter?.activate("mark", "Updating paid status");

      const result = await markPaidService.markByDueEntryId(userId, dueEntryId);

      if (!result.ok) {
        await reporter?.fail("Due entry not found");
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Due entry not found",
        });
      }

      await reporter?.completeStep("mark");
      await reporter?.activate(
        "reminders",
        result.remindersSuppressed > 0
          ? `${result.remindersSuppressed} reminder(s) silenced`
          : "Updating reminder status",
      );
      await reporter?.completeStep("reminders");
      await reporter?.activate("sync", "Saving");
      await reporter?.completeStep("sync");
      await reporter?.complete();

      return {
        ok: true,
        mode: "full" as const,
        remindersSuppressed: result.remindersSuppressed,
        calendarUpdated: result.calendarUpdated,
      };
    } catch (error) {
      if (error instanceof TRPCError) throw error;
      const message = error instanceof Error ? error.message : String(error);
      await reporter?.fail(message);
      throw error;
    } finally {
      await reporter?.flush();
    }
  },

  async markUnpaid(userId: string, dueEntryId: string, processId?: string) {
    let reporter: DueActionProgressReporter | null = null;
    if (processId) {
      reporter = await DueActionProgressReporter.create(
        userId,
        processId,
        "mark_unpaid",
      );
      await reporter.activate("prepare", "Loading due entry");
    }

    try {
      await reporter?.completeStep("prepare");
      await reporter?.activate("mark", "Updating unpaid status");

      const result = await markPaidService.markUnpaidByDueEntryId(
        userId,
        dueEntryId,
        { skipReceiptRemoval: true },
      );

      if (!result.ok) {
        if (result.reason === "not_found") {
          await reporter?.fail("Due entry not found");
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Due entry not found",
          });
        }
        if (result.reason === "already_unpaid") {
          await reporter?.complete();
          return { ok: true, mode: "db_only" as const };
        }
        await reporter?.fail("Could not mark as unpaid");
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Could not mark as unpaid",
        });
      }

      await reporter?.completeStep("mark");
      await reporter?.activate("receipt", "Removing payment receipt");

      const receiptsRemoved = await deleteReceiptsForDueEntry(
        userId,
        result.entry,
      );

      await reporter?.completeStep("receipt");
      await reporter?.activate(
        "sync",
        receiptsRemoved > 0
          ? `${receiptsRemoved} receipt(s) removed`
          : "Saving",
      );
      await reporter?.completeStep("sync");
      await reporter?.complete();

      return {
        ok: true,
        mode: "full" as const,
        remindersRestored: result.remindersRestored,
        receiptsRemoved,
      };
    } catch (error) {
      if (error instanceof TRPCError) throw error;
      const message = error instanceof Error ? error.message : String(error);
      await reporter?.fail(message);
      throw error;
    } finally {
      await reporter?.flush();
    }
  },
};
