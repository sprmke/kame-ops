"use client";

import { useState } from "react";
import { MessageCircle, Slack, Mail, Calendar } from "lucide-react";
import { toast } from "sonner";

import { DashboardPageHeader } from "@/components/shared/DashboardPageHeader";
import { LoadingSpinner } from "@/components/shared/LoadingSpinner";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { api } from "@/lib/api/client";

export function IntegrationsPage() {
  const utils = api.useUtils();
  const { data: integrations, isLoading } = api.integrations.list.useQuery();
  const upsert = api.integrations.upsert.useMutation({
    onSuccess: () => {
      toast.success("Integration saved — applied on next SOA/reminder run");
      void utils.integrations.list.invalidate();
    },
    onError: (e) => toast.error(e.message),
  });

  const [telegramToken, setTelegramToken] = useState("");
  const [telegramChat, setTelegramChat] = useState("");
  const [telegramWebLink, setTelegramWebLink] = useState("");
  const [slackWebhook, setSlackWebhook] = useState("");

  const connected = new Set(integrations?.map((i) => i.provider) ?? []);

  if (isLoading) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <LoadingSpinner size="lg" />
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <DashboardPageHeader
        title="Integrations"
        description="Connect notification channels. Secrets are encrypted and applied when you run SOA or reminders."
      />

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <MessageCircle className="h-5 w-5 text-primary" />
                <CardTitle className="text-base">Telegram</CardTitle>
              </div>
              {connected.has("telegram") && (
                <StatusBadge label="Connected" variant="success" />
              )}
            </div>
            <CardDescription>
              Bot token + chat ID for PDF summaries and reminders.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="space-y-2">
              <Label>Bot token</Label>
              <Input
                type="password"
                value={telegramToken}
                onChange={(e) => setTelegramToken(e.target.value)}
                placeholder="From @BotFather"
              />
            </div>
            <div className="space-y-2">
              <Label>Chat ID</Label>
              <Input
                value={telegramChat}
                onChange={(e) => setTelegramChat(e.target.value)}
                placeholder="Your chat or group ID"
              />
            </div>
            <div className="space-y-2">
              <Label>Web link (optional)</Label>
              <Input
                value={telegramWebLink}
                onChange={(e) => setTelegramWebLink(e.target.value)}
                placeholder="https://web.telegram.org/k/#@your_bot"
              />
            </div>
            <Button
              className="w-full"
              onClick={() =>
                upsert.mutate({
                  provider: "telegram",
                  config: {
                    botToken: telegramToken,
                    chatId: telegramChat,
                    webLink: telegramWebLink,
                  },
                })
              }
            >
              Save Telegram
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Slack className="h-5 w-5 text-primary" />
                <CardTitle className="text-base">Slack</CardTitle>
              </div>
              {connected.has("slack") && (
                <StatusBadge label="Connected" variant="success" />
              )}
            </div>
            <CardDescription>
              Incoming webhook for text notifications.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="space-y-2">
              <Label>Webhook URL</Label>
              <Input
                type="password"
                value={slackWebhook}
                onChange={(e) => setSlackWebhook(e.target.value)}
                placeholder="https://hooks.slack.com/..."
              />
            </div>
            <Button
              className="w-full"
              onClick={() =>
                upsert.mutate({
                  provider: "slack",
                  config: { webhookUrl: slackWebhook },
                })
              }
            >
              Save Slack
            </Button>
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader>
            <div className="flex items-center gap-2">
              <Mail className="h-5 w-5 text-muted-foreground" />
              <CardTitle className="text-base">
                Gmail & Google Calendar
              </CardTitle>
            </div>
            <CardDescription>
              OAuth credentials live in{" "}
              <code className="text-xs">configs/credentials.json</code> and{" "}
              <code className="text-xs">configs/token.json</code> (legacy CLI
              layout). Run <code className="text-xs">gmail-auth</code> from the
              legacy repo once, then copy configs into your server environment.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-3">
            <div className="flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-sm">
              <Calendar className="h-4 w-4 text-muted-foreground" />
              Calendar events on SOA run when{" "}
              <code>GOOGLE_CALENDAR_AUTO=1</code>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
