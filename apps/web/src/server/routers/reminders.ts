import { z } from "zod";

import { protectedProcedure, router } from "@/server/trpc";
import { dueEntryService } from "@/server/services/due-entry.service";
import { reminderService } from "@/server/services/reminder.service";

export const remindersRouter = router({
  listDue: protectedProcedure
    .input(z.object({ unpaidOnly: z.boolean().optional() }).optional())
    .query(({ ctx, input }) =>
      reminderService.listDueEntries(ctx.user.id, input?.unpaidOnly ?? true),
    ),

  sendNow: protectedProcedure.mutation(({ ctx }) =>
    reminderService.sendDueRemindersForUser(ctx.user.id),
  ),

  markPaid: protectedProcedure
    .input(z.object({ dueEntryId: z.string().uuid() }))
    .mutation(({ ctx, input }) =>
      dueEntryService.markPaid(ctx.user.id, input.dueEntryId),
    ),

  markUnpaid: protectedProcedure
    .input(z.object({ dueEntryId: z.string().uuid() }))
    .mutation(({ ctx, input }) =>
      dueEntryService.markUnpaid(ctx.user.id, input.dueEntryId),
    ),
});
