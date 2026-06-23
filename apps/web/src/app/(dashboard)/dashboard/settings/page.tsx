'use client';

import { TransactionCategoryRulesSettings } from '@/features/dashboard/settings/components/TransactionCategoryRulesSettings';
import { DashboardPageHeader } from '@/components/shared/DashboardPageHeader';
import { StatusBadge } from '@/components/shared/StatusBadge';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { api } from '@/lib/api/client';

export default function SettingsPage() {
  const { data: integrations } = api.integrations.list.useQuery();
  const connected = new Set(integrations?.map((i) => i.provider) ?? []);

  return (
    <div className="space-y-8">
      <DashboardPageHeader
        title="Settings"
        description="Environment configuration and integration status."
      />

      <TransactionCategoryRulesSettings />

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Connected services</CardTitle>
          <CardDescription>
            Manage credentials on the Integrations page.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          {(['telegram', 'slack', 'gmail', 'google_calendar'] as const).map(
            (p) => (
              <StatusBadge
                key={p}
                label={p.replace('_', ' ')}
                variant={connected.has(p) ? 'success' : 'muted'}
              />
            ),
          )}
        </CardContent>
      </Card>
    </div>
  );
}
