import { z } from "zod";

import { protectedProcedure, router } from "@/server/trpc";
import { soaService } from "@/server/services/soa.service";

export const soaRouter = router({
  list: protectedProcedure.query(({ ctx }) =>
    soaService.listStatements(ctx.user.id),
  ),

  runPipeline: protectedProcedure
    .input(
      z
        .object({
          month: z.number().int().min(1).max(12).optional(),
          year: z.number().int().optional(),
        })
        .optional(),
    )
    .mutation(({ ctx, input }) =>
      soaService.runSoaPipeline(ctx.user.id, input),
    ),

  pollGmail: protectedProcedure.mutation(({ ctx }) =>
    soaService.pollNewSoaFromGmail(ctx.user.id),
  ),
});
