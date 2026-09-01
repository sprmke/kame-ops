import { DashboardPageHeader } from "@/components/shared/DashboardPageHeader";
import { TrpcHydrate } from "@/components/providers/TrpcHydrate";
import { IntegrationsSettings } from "@/features/dashboard/settings/components/IntegrationsSettings";
import { CustomTransactionCategoriesSettings } from "@/features/dashboard/settings/components/CustomTransactionCategoriesSettings";
import { TransactionCategoryRulesSettings } from "@/features/dashboard/settings/components/TransactionCategoryRulesSettings";
import { prefetchForPage } from "@/server/ssr";

export default async function SettingsPage() {
  const state = await prefetchForPage((helpers) =>
    Promise.all([
      helpers.integrations.list.prefetch(),
      helpers.integrations.listGoogleAccounts.prefetch(),
      helpers.integrations.getFormConfigs.prefetch(),
      helpers.creditCards.list.prefetch(),
    ]),
  );

  return (
    <TrpcHydrate state={state}>
      <div className="space-y-8">
        <DashboardPageHeader title="Settings" />

        <IntegrationsSettings />

        <CustomTransactionCategoriesSettings />

        <TransactionCategoryRulesSettings />
      </div>
    </TrpcHydrate>
  );
}
