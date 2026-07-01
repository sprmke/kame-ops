"use client";

import { DashboardPageHeader } from "@/components/shared/DashboardPageHeader";
import { IntegrationsSettings } from "@/features/dashboard/settings/components/IntegrationsSettings";
import { CustomTransactionCategoriesSettings } from "@/features/dashboard/settings/components/CustomTransactionCategoriesSettings";
import { TransactionCategoryRulesSettings } from "@/features/dashboard/settings/components/TransactionCategoryRulesSettings";

export default function SettingsPage() {
  return (
    <div className="space-y-8">
      <DashboardPageHeader title="Settings" />

      <IntegrationsSettings />

      <CustomTransactionCategoriesSettings />

      <TransactionCategoryRulesSettings />
    </div>
  );
}
