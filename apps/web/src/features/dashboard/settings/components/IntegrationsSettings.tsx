'use client';

import { useEffect, useState } from 'react';
import { Mail, MessageCircle, Slack } from 'lucide-react';
import { toast } from 'sonner';

import { IntegrationsSettingsSkeleton } from '@/components/shared/skeletons';
import { StatusBadge } from '@/components/shared/StatusBadge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { PasswordInput } from '@/components/ui/password-input';
import { api } from '@/lib/api/client';

import { useGoogleLinkCallback } from '@/hooks/use-google-link-callback';

import { AiApiKeysSettings } from './AiApiKeysSettings';
import { GoogleAccountsSettings } from './GoogleAccountsSettings';

export function IntegrationsSettings() {
  useGoogleLinkCallback();
  const utils = api.useUtils();
  const { data: integrations, isLoading } = api.integrations.list.useQuery();
  const { data: googleAccounts, isLoading: isLoadingGoogleAccounts } =
    api.integrations.listGoogleAccounts.useQuery();
  const { data: formConfigs, isLoading: isLoadingConfigs } =
    api.integrations.getFormConfigs.useQuery();
  const upsert = api.integrations.upsert.useMutation({
    onSuccess: () => {
      toast.success('Integration saved — applied on next SOA/reminder run');
      void utils.integrations.list.invalidate();
      void utils.integrations.getFormConfigs.invalidate();
    },
    onError: (e) => toast.error(e.message),
  });

  const [telegramToken, setTelegramToken] = useState('');
  const [telegramChat, setTelegramChat] = useState('');
  const [telegramWebLink, setTelegramWebLink] = useState('');
  const [slackWebhook, setSlackWebhook] = useState('');

  useEffect(() => {
    if (!formConfigs) return;
    if (formConfigs.telegram) {
      setTelegramToken(formConfigs.telegram.botToken ?? '');
      setTelegramChat(formConfigs.telegram.chatId ?? '');
      setTelegramWebLink(formConfigs.telegram.webLink ?? '');
    }
    if (formConfigs.slack) {
      setSlackWebhook(formConfigs.slack.webhookUrl ?? '');
    }
    if (formConfigs.secretsUnavailable.telegram) {
      toast.error(
        'Telegram settings could not be decrypted. Re-enter them and save',
      );
    }
    if (formConfigs.secretsUnavailable.slack) {
      toast.error(
        'Slack webhook could not be decrypted. Re-enter it and save.',
      );
    }
  }, [formConfigs]);

  const connected = new Set(integrations?.map((i) => i.provider) ?? []);
  const gmailConnected =
    connected.has('gmail') && (googleAccounts?.length ?? 0) > 0;

  if (isLoading || isLoadingConfigs || isLoadingGoogleAccounts) {
    return <IntegrationsSettingsSkeleton />;
  }

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <Card className="lg:col-span-2">
        <CardHeader>
          <div className="flex flex-wrap gap-3 justify-between items-center">
            <div className="flex gap-2 items-center">
              <Mail className="w-5 h-5 text-primary" />
              <CardTitle className="text-base">
                Gmail & Google Calendar
              </CardTitle>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <GoogleAccountsSettings />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex justify-between items-center">
            <div className="flex gap-2 items-center">
              <MessageCircle className="w-5 h-5 text-primary" />
              <CardTitle className="text-base">Telegram</CardTitle>
            </div>
            {connected.has('telegram') && (
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
                provider: 'telegram',
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
          <div className="flex justify-between items-center">
            <div className="flex gap-2 items-center">
              <Slack className="w-5 h-5 text-primary" />
              <CardTitle className="text-base">Slack</CardTitle>
            </div>
            {connected.has('slack') && (
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
                provider: 'slack',
                config: { webhookUrl: slackWebhook },
              })
            }
          >
            Save Slack
          </Button>
        </CardContent>
      </Card>

      <AiApiKeysSettings />
    </div>
  );
}
