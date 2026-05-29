import { protectedProcedure, router } from "@/server/trpc";
import { overviewService } from "@/server/services/overview.service";

export const overviewRouter = router({
  stats: protectedProcedure.query(({ ctx }) =>
    overviewService.getStats(ctx.user.id),
  ),
});
