"use client";

import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { ROUTES } from "@/config/routes";
import { api } from "@/lib/api/client";
import { formatGoogleAccountLabel } from "@/lib/google/google-account-display";

const CONNECT_OTHER_GMAIL_VALUE = "__connect_other_gmail__";

type GoogleAccountSelectProps = {
  value: string | null;
  onChange: (value: string | null) => void;
  id?: string;
  /** When set, links this card to the new account after OAuth. */
  creditCardId?: string | null;
  /** Called before OAuth redirect (e.g. persist add-card form draft). */
  onBeforeConnect?: () => void;
};

export function GoogleAccountSelect({
  value,
  onChange,
  id = "google-account",
  creditCardId = null,
  onBeforeConnect,
}: GoogleAccountSelectProps) {
  const [connectPending, setConnectPending] = useState(false);
  const getLinkUrl = api.integrations.getGoogleLinkUrl.useMutation({
    onError: (e) => toast.error(e.message),
  });

  const { data: accounts, isLoading } =
    api.integrations.listGoogleAccounts.useQuery();

  useEffect(() => {
    if (!accounts?.length || value) return;
    onChange(accounts[0]!.id);
  }, [accounts, value, onChange]);

  const selectedAccount = useMemo(
    () =>
      accounts?.find((account) => account.id === (value ?? accounts[0]?.id)),
    [accounts, value],
  );

  async function handleConnectOtherGmail() {
    onBeforeConnect?.();
    setConnectPending(true);
    try {
      const callbackUrl = creditCardId
        ? `${window.location.origin}${ROUTES.dashboard.creditCards}?edit=${creditCardId}`
        : `${window.location.origin}${ROUTES.dashboard.creditCards}?add=1`;
      const result = await getLinkUrl.mutateAsync({
        callbackUrl,
        creditCardIds: creditCardId ? [creditCardId] : undefined,
      });
      window.location.href = result.url;
    } finally {
      setConnectPending(false);
    }
  }

  if (isLoading) {
    return (
      <div className="space-y-2">
        <Label htmlFor={id}>Gmail account</Label>
        <Select disabled>
          <SelectTrigger id={id}>
            <SelectValue placeholder="Loading…" />
          </SelectTrigger>
        </Select>
      </div>
    );
  }

  if (!accounts?.length) {
    return (
      <div className="space-y-2">
        <Label htmlFor={id}>Gmail account</Label>
        <ButtonLikeSelect
          id={id}
          label="Connect Gmail account"
          disabled={connectPending || getLinkUrl.isPending}
          onClick={() => void handleConnectOtherGmail()}
        />
      </div>
    );
  }

  const selectValue = value ?? accounts[0]!.id;

  return (
    <div className="space-y-2">
      <Label htmlFor={id}>Gmail account</Label>
      <Select
        value={selectValue}
        disabled={connectPending || getLinkUrl.isPending}
        onValueChange={(next) => {
          if (next === CONNECT_OTHER_GMAIL_VALUE) {
            void handleConnectOtherGmail();
            return;
          }
          onChange(next || null);
        }}
      >
        <SelectTrigger id={id}>
          <SelectValue placeholder="Select Gmail account">
            {connectPending || getLinkUrl.isPending
              ? "Redirecting…"
              : selectedAccount
                ? formatGoogleAccountLabel(selectedAccount)
                : "Select Gmail account"}
          </SelectValue>
        </SelectTrigger>
        <SelectContent>
          {accounts.map((account) => (
            <SelectItem key={account.id} value={account.id}>
              {formatGoogleAccountLabel(account)}
            </SelectItem>
          ))}
          <SelectSeparator />
          <SelectItem value={CONNECT_OTHER_GMAIL_VALUE}>
            Connect other Gmail account
          </SelectItem>
        </SelectContent>
      </Select>
    </div>
  );
}

function ButtonLikeSelect({
  id,
  label,
  disabled,
  onClick,
}: {
  id: string;
  label: string;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      id={id}
      type="button"
      disabled={disabled}
      onClick={onClick}
      className="flex h-10 w-full min-h-[44px] items-center justify-between rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background disabled:cursor-not-allowed disabled:opacity-50"
    >
      <span>{disabled ? "Redirecting…" : label}</span>
    </button>
  );
}
