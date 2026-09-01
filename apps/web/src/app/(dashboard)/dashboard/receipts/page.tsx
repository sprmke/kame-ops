import { TrpcHydrate } from "@/components/providers/TrpcHydrate";
import { ReceiptsPage } from "@/features/dashboard/receipts/components/ReceiptsPage";
import { prefetchForPage } from "@/server/ssr";

export default async function Page() {
  const state = await prefetchForPage((helpers) =>
    Promise.all([
      helpers.receipts.list.prefetch(),
      helpers.reminders.listDue.prefetch({ unpaidOnly: false }),
      helpers.integrations.list.prefetch(),
    ]),
  );

  return (
    <TrpcHydrate state={state}>
      <ReceiptsPage />
    </TrpcHydrate>
  );
}
