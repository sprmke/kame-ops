import { TrpcHydrate } from "@/components/providers/TrpcHydrate";
import { OverviewPage } from "@/features/dashboard/overview/components/OverviewPage";
import { prefetchForPage } from "@/server/ssr";

export default async function Page() {
  const state = await prefetchForPage((helpers) =>
    helpers.overview.stats.prefetch(),
  );

  return (
    <TrpcHydrate state={state}>
      <OverviewPage />
    </TrpcHydrate>
  );
}
