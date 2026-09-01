import { TrpcHydrate } from "@/components/providers/TrpcHydrate";
import { SoaListPage } from "@/features/dashboard/soa/components/SoaListPage";
import { prefetchForPage } from "@/server/ssr";

export default async function Page() {
  const state = await prefetchForPage((helpers) =>
    helpers.soa.listPeriods.prefetch(),
  );

  return (
    <TrpcHydrate state={state}>
      <SoaListPage />
    </TrpcHydrate>
  );
}
