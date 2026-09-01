import { TrpcHydrate } from "@/components/providers/TrpcHydrate";
import { CreditCardsPage } from "@/features/dashboard/credit-cards/components/CreditCardsPage";
import { prefetchForPage } from "@/server/ssr";

export default async function Page() {
  const state = await prefetchForPage((helpers) =>
    helpers.creditCards.list.prefetch(),
  );

  return (
    <TrpcHydrate state={state}>
      <CreditCardsPage />
    </TrpcHydrate>
  );
}
