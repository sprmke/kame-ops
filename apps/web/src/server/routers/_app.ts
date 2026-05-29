import { router } from "@/server/trpc";

import { automationsRouter } from "./automations";
import { creditCardsRouter } from "./credit-cards";
import { integrationsRouter } from "./integrations";
import { overviewRouter } from "./overview";
import { receiptsRouter } from "./receipts";
import { remindersRouter } from "./reminders";
import { soaRouter } from "./soa";

export const appRouter = router({
  overview: overviewRouter,
  creditCards: creditCardsRouter,
  soa: soaRouter,
  reminders: remindersRouter,
  integrations: integrationsRouter,
  automations: automationsRouter,
  receipts: receiptsRouter,
});

export type AppRouter = typeof appRouter;
