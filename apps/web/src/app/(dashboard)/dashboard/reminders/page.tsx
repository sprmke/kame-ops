import { RemindersHubPage } from "@/components/dashboard/RemindersHubPage";
import { TrpcHydrate } from "@/components/providers/TrpcHydrate";
import { prefetchForPage } from "@/server/ssr";

export default async function Page() {
  const state = await prefetchForPage((helpers) =>
    Promise.all([
      helpers.automations.list.prefetch(),
      helpers.reminders.listDue.prefetch({ unpaidOnly: false }),
      helpers.reminders.status.prefetch(),
      helpers.integrations.list.prefetch(),
    ]),
  );

  return (
    <TrpcHydrate state={state}>
      <RemindersHubPage />
    </TrpcHydrate>
  );
}
