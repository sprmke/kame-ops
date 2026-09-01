"use client";

import { api } from "@/lib/api/client";
import { ROUTES } from "@/config/routes";

/**
 * Warms the query cache for a dashboard route before the user commits to it.
 *
 * Next.js route prefetching only fetches the shell for these dynamic pages, so
 * without this the data request still starts after navigation.
 */
export function useNavDataPrefetch() {
  const utils = api.useUtils();

  const prefetchers: Record<string, () => void> = {
    [ROUTES.dashboard.overview]: () => void utils.overview.stats.prefetch(),
    [ROUTES.dashboard.creditCards]: () =>
      void utils.creditCards.list.prefetch(),
    [ROUTES.dashboard.soa]: () => void utils.soa.listPeriods.prefetch(),
    [ROUTES.dashboard.reminders]: () => {
      void utils.automations.list.prefetch();
      void utils.reminders.listDue.prefetch({ unpaidOnly: false });
      void utils.reminders.status.prefetch();
      void utils.integrations.list.prefetch();
    },
    [ROUTES.dashboard.receipts]: () => {
      void utils.receipts.list.prefetch();
      void utils.reminders.listDue.prefetch({ unpaidOnly: false });
      void utils.integrations.list.prefetch();
    },
    [ROUTES.dashboard.settings]: () => {
      void utils.integrations.list.prefetch();
      void utils.integrations.listGoogleAccounts.prefetch();
      void utils.integrations.getFormConfigs.prefetch();
      void utils.creditCards.list.prefetch();
    },
  };

  return (href: string) => prefetchers[href]?.();
}
