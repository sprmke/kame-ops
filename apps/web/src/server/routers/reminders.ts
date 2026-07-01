import { z } from "zod";

import { protectedProcedure, router } from "@/server/trpc";
import { dueActionProgressService } from "@/server/services/due-action-progress.service";
import { dueEntryService } from "@/server/services/due-entry.service";
import { reminderService } from "@/server/services/reminder.service";

export const remindersRouter = router({
  listDue: protectedProcedure
    .input(z.object({ unpaidOnly: z.boolean().optional() }).optional())
    .query(({ ctx, input }) =>
      reminderService.listDueEntries(ctx.user.id, input?.unpaidOnly ?? true),
    ),

  status: protectedProcedure.query(({ ctx }) =>
    reminderService.getReminderStatus(ctx.user.id),
  ),

  getActionProgress: protectedProcedure
    .input(z.object({ processId: z.string().uuid() }))
    .query(({ ctx, input }) =>
      dueActionProgressService.getSnapshot(ctx.user.id, input.processId),
    ),

  markPaid: protectedProcedure
    .input(
      z.object({
        dueEntryId: z.string().uuid(),
        processId: z.string().uuid().optional(),
      }),
    )
    .mutation(({ ctx, input }) =>
      dueEntryService.markPaid(ctx.user.id, input.dueEntryId, input.processId),
    ),

  markUnpaid: protectedProcedure
    .input(
      z.object({
        dueEntryId: z.string().uuid(),
        processId: z.string().uuid().optional(),
      }),
    )
    .mutation(({ ctx, input }) =>
      dueEntryService.markUnpaid(
        ctx.user.id,
        input.dueEntryId,
        input.processId,
      ),
    ),
});
