"use client";

import { useEffect, useState } from "react";
import { Mail, MessageCircle, Slack } from "lucide-react";
import { signIn } from "next-auth/react";
import { toast } from "sonner";

import { DashboardPageHeader } from "@/components/shared/DashboardPageHeader";
import { LoadingSpinner } from "@/components/shared/LoadingSpinner";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PasswordInput } from "@/components/ui/password-input";
import { ROUTES } from "@/config/routes";
import { api } from "@/lib/api/client";

export function IntegrationsPage() {
  const utils = api.useUtils();
  const { data: integrations, isLoading } = api.integrations.list.useQuery();
  const { data: formConfigs, isLoading: isLoadingConfigs } =
    api.integrations.getFormConfigs.useQuery();
  const upsert = api.integrations.upsert.useMutation({
    onSuccess: () => {
      toast.success("Integration saved — applied on next SOA/reminder run");
      void utils.integrations.list.invalidate();
      void utils.integrations.getFormConfigs.invalidate();
    },
    onError: (e) => toast.error(e.message),
  });

  const [telegramToken, setTelegramToken] = useState("");
  const [telegramChat, setTelegramChat] = useState("");
  const [telegramWebLink, setTelegramWebLink] = useState("");
  const [slackWebhook, setSlackWebhook] = useState("");
  const [reconnectingGoogle, setReconnectingGoogle] = useState(false);

  useEffect(() => {
    if (!formConfigs) return;
    if (formConfigs.telegram) {
      setTelegramToken(formConfigs.telegram.botToken ?? "");
      setTelegramChat(formConfigs.telegram.chatId ?? "");
      setTelegramWebLink(formConfigs.telegram.webLink ?? "");
    }
    if (formConfigs.slack) {
      setSlackWebhook(formConfigs.slack.webhookUrl ?? "");
    }
  }, [formConfigs]);

  const connected = new Set(integrations?.map((i) => i.provider) ?? []);
  const gmailConnected = connected.has("gmail");

  if (isLoading || isLoadingConfigs) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <LoadingSpinner size="lg" />
      </div>
    );
  }

  async function reconnectGoogle() {
    setReconnectingGoogle(true);
    await signIn("google", {
      callbackUrl: ROUTES.dashboard.integrations,
    });
  }

  return (
    <div className="space-y-8">
      <DashboardPageHeader title="Integrations" />

      <div className="grid gap-6 lg:grid-cols-2">
        <Card className="lg:col-span-2">
          <CardHeader>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <Mail className="h-5 w-5 text-primary" />
                <CardTitle className="text-base">
                  Gmail & Google Calendar
                </CardTitle>
              </div>
              {gmailConnected && (
                <StatusBadge label="Connected" variant="success" />
              )}
            </div>
          </CardHeader>
          <CardContent>
            <Button
              variant={gmailConnected ? "outline" : "default"}
              onClick={reconnectGoogle}
              disabled={reconnectingGoogle}
            >
              {gmailConnected ? "Reconnect Google" : "Connect Google"}
            </Button>
          </CardContent>
        </Card>

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
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="space-y-2">
              <Label>Bot token</Label>
              <PasswordInput
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
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="space-y-2">
              <Label>Webhook URL</Label>
              <PasswordInput
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
      </div>
    </div>
  );
}
