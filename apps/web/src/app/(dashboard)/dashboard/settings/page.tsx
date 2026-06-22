"use client";

import { TransactionCategoryRulesSettings } from "@/features/dashboard/settings/components/TransactionCategoryRulesSettings";
import { DashboardPageHeader } from "@/components/shared/DashboardPageHeader";
import { StatusBadge } from "@/components/shared/StatusBadge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { api } from "@/lib/api/client";

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
          {(["telegram", "slack", "gmail", "google_calendar"] as const).map(
            (p) => (
              <StatusBadge
                key={p}
                label={p.replace("_", " ")}
                variant={connected.has(p) ? "success" : "muted"}
              />
            ),
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Environment variables</CardTitle>
          <CardDescription>
            Copy <code className="text-xs">apps/web/.env.example</code> to{" "}
            <code className="text-xs">.env.local</code>
          </CardDescription>
        </CardHeader>
        <CardContent>
          <dl className="grid gap-3 text-sm sm:grid-cols-2">
            {[
              ["DATABASE_URL", "Supabase Postgres connection"],
              ["AUTH_SECRET", "NextAuth session signing (32+ chars)"],
              ["ENCRYPTION_KEY", "Card passwords & integration secrets"],
              ["CRON_SECRET", "Bearer token for /api/cron/* routes"],
              ["TELEGRAM_BOT_TOKEN", "Fallback if not in Integrations UI"],
              [
                "TELEGRAM_DEFAULT_USER_ID",
                "User UUID for Telegram webhook mark-paid",
              ],
            ].map(([key, desc]) => (
              <div
                key={key}
                className="rounded-lg border border-border px-3 py-2"
              >
                <dt className="font-mono text-xs font-medium text-foreground">
                  {key}
                </dt>
                <dd className="mt-1 text-xs text-muted-foreground">{desc}</dd>
              </div>
            ))}
          </dl>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Cron endpoints</CardTitle>
          <CardDescription>
            Schedule these with Supabase Cron or external scheduler.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-2 font-mono text-xs text-muted-foreground">
          <p>GET /api/cron/reminders</p>
          <p>GET /api/cron/soa-poll</p>
          <p className="text-foreground">
            Header: Authorization: Bearer {"{CRON_SECRET}"}
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
