"use client";

import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import { ConfirmDialog } from "@/components/shared/ConfirmDialog";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { ROUTES } from "@/config/routes";
import { api } from "@/lib/api/client";
import { formatBankIssuer } from "@/lib/db/schema/credit-cards";
import {
  formatGoogleAccountLabel,
  formatGoogleAccountSubtitle,
  formatGoogleAccountTitle,
} from "@/lib/google/google-account-display";
import { cn } from "@/lib/utils/cn";

type GoogleAccountOption = {
  id: string;
  name: string | null;
  email: string | null;
  isDefault: boolean;
};

function defaultGoogleAccountId(
  googleAccounts: GoogleAccountOption[],
): string | null {
  return googleAccounts.find((account) => account.isDefault)?.id ?? null;
}

function effectiveCardGoogleAccountId(
  card: { googleAccountId: string | null },
  defaultAccountId: string | null,
): string | null {
  return card.googleAccountId ?? defaultAccountId;
}

function isCardLockedToOtherGoogleAccount(
  card: { googleAccountId: string | null },
  targetAccountId: string | null,
  defaultAccountId: string | null,
): boolean {
  const ownerId = effectiveCardGoogleAccountId(card, defaultAccountId);
  if (!ownerId) return false;
  if (!targetAccountId) return true;
  return ownerId !== targetAccountId;
}

type CreditCardLinkChecklistProps = {
  selectedIds: string[];
  onToggle: (cardId: string) => void;
  accountId: string | null;
  googleAccounts: GoogleAccountOption[];
  idPrefix: string;
  /** When true, cards already on another account cannot be selected. */
  lockLinkedToOtherAccounts?: boolean;
};

function CreditCardLinkChecklist({
  selectedIds,
  onToggle,
  accountId,
  googleAccounts,
  idPrefix,
  lockLinkedToOtherAccounts = false,
}: CreditCardLinkChecklistProps) {
  const { data: cards } = api.creditCards.list.useQuery();

  const activeCards = useMemo(
    () => (cards ?? []).filter((c) => c.isActive),
    [cards],
  );

  const defaultAccountId = useMemo(
    () => defaultGoogleAccountId(googleAccounts),
    [googleAccounts],
  );

  const accountEmailById = useMemo(() => {
    const map = new Map<string, string>();
    for (const account of googleAccounts) {
      map.set(account.id, formatGoogleAccountLabel(account));
    }
    return map;
  }, [googleAccounts]);

  if (activeCards.length === 0) {
    return (
      <p className="text-sm text-muted-foreground">
        No credit cards configured.
      </p>
    );
  }

  return (
    <ul className="overflow-y-auto p-3 space-y-2 max-h-56 rounded-lg border border-border">
      {activeCards.map((card) => {
        const checked = selectedIds.includes(card.id);
        const inputId = `${idPrefix}-${card.id}`;
        const ownerId = effectiveCardGoogleAccountId(card, defaultAccountId);
        const locked =
          lockLinkedToOtherAccounts &&
          isCardLockedToOtherGoogleAccount(card, accountId, defaultAccountId);
        const linkedLabel =
          ownerId &&
          (!accountId || ownerId !== accountId) &&
          accountEmailById.get(ownerId);

        return (
          <li key={card.id}>
            <label
              htmlFor={inputId}
              className={cn(
                "flex min-h-[44px] items-start gap-3 rounded-md px-1 py-1",
                locked ? "cursor-not-allowed opacity-50" : "cursor-pointer",
              )}
            >
              <input
                id={inputId}
                type="checkbox"
                checked={checked}
                disabled={locked}
                onChange={() => {
                  if (!locked) onToggle(card.id);
                }}
                className="mt-1 w-4 h-4 shrink-0 accent-primary disabled:cursor-not-allowed"
              />
              <span className="min-w-0 text-sm">
                <span className="block">
                  {card.label ?? formatBankIssuer(card.issuer)} ••••{" "}
                  {card.last4}
                </span>
                {linkedLabel ? (
                  <span className="block text-xs text-muted-foreground">
                    Linked to {linkedLabel}
                  </span>
                ) : null}
              </span>
            </label>
          </li>
        );
      })}
    </ul>
  );
}

function resolveLinkedCardIds(
  cards: { id: string; googleAccountId: string | null }[],
  accountId: string,
  isDefault: boolean,
): string[] {
  return cards
    .filter(
      (card) =>
        card.googleAccountId === accountId ||
        (isDefault && card.googleAccountId === null),
    )
    .map((card) => card.id);
}

type ConnectGoogleAccountDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialCreditCardIds?: string[];
  reconnectAccountId?: string | null;
  googleAccounts: GoogleAccountOption[];
};

export function ConnectGoogleAccountDialog({
  open,
  onOpenChange,
  initialCreditCardIds = [],
  reconnectAccountId = null,
  googleAccounts,
}: ConnectGoogleAccountDialogProps) {
  const utils = api.useUtils();
  const { data: cards } = api.creditCards.list.useQuery(undefined, {
    enabled: open,
  });
  const getLinkUrl = api.integrations.getGoogleLinkUrl.useMutation({
    onError: (e) => toast.error(e.message),
  });

  const [selectedIds, setSelectedIds] =
    useState<string[]>(initialCreditCardIds);

  const defaultAccountId = useMemo(
    () => defaultGoogleAccountId(googleAccounts),
    [googleAccounts],
  );

  useEffect(() => {
    if (!open) return;
    const selectableIds = (cards ?? [])
      .filter((card) => card.isActive)
      .filter(
        (card) =>
          !isCardLockedToOtherGoogleAccount(
            card,
            reconnectAccountId,
            defaultAccountId,
          ),
      )
      .map((card) => card.id);
    setSelectedIds(
      initialCreditCardIds.filter((id) => selectableIds.includes(id)),
    );
  }, [open, initialCreditCardIds, cards, reconnectAccountId, defaultAccountId]);

  function toggleCard(cardId: string) {
    setSelectedIds((current) =>
      current.includes(cardId)
        ? current.filter((id) => id !== cardId)
        : [...current, cardId],
    );
  }

  async function handleConnect() {
    const result = await getLinkUrl.mutateAsync({
      callbackUrl: ROUTES.dashboard.settings,
      creditCardIds: selectedIds,
    });
    void utils.integrations.listGoogleAccounts.invalidate();
    window.location.href = result.url;
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-md overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {reconnectAccountId ? "Reconnect Google" : "Connect Google"}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Credit cards</Label>
            <CreditCardLinkChecklist
              selectedIds={selectedIds}
              onToggle={toggleCard}
              accountId={reconnectAccountId}
              googleAccounts={googleAccounts}
              idPrefix="google-link-card"
              lockLinkedToOtherAccounts
            />
          </div>
          <Button
            className="w-full"
            onClick={() => void handleConnect()}
            disabled={getLinkUrl.isPending}
          >
            {getLinkUrl.isPending ? "Redirecting…" : "Continue with Google"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

type ManageGoogleAccountCardsDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  account: GoogleAccountOption | null;
  googleAccounts: GoogleAccountOption[];
};

function ManageGoogleAccountCardsDialog({
  open,
  onOpenChange,
  account,
  googleAccounts,
}: ManageGoogleAccountCardsDialogProps) {
  const utils = api.useUtils();
  const { data: cards } = api.creditCards.list.useQuery(undefined, {
    enabled: open && !!account,
  });

  const updateCards = api.integrations.updateGoogleAccountCards.useMutation({
    onSuccess: () => {
      toast.success("Credit cards updated");
      void utils.integrations.listGoogleAccounts.invalidate();
      void utils.creditCards.list.invalidate();
      onOpenChange(false);
    },
    onError: (e) => toast.error(e.message),
  });

  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  const defaultAccountId = useMemo(
    () => defaultGoogleAccountId(googleAccounts),
    [googleAccounts],
  );

  useEffect(() => {
    if (!open || !account || !cards) return;
    setSelectedIds(resolveLinkedCardIds(cards, account.id, account.isDefault));
  }, [open, account, cards]);

  function toggleCard(cardId: string) {
    setSelectedIds((current) =>
      current.includes(cardId)
        ? current.filter((id) => id !== cardId)
        : [...current, cardId],
    );
  }

  function handleSave() {
    if (!account || !cards) return;
    const selectableIds = cards
      .filter((card) => card.isActive)
      .filter(
        (card) =>
          !isCardLockedToOtherGoogleAccount(card, account.id, defaultAccountId),
      )
      .map((card) => card.id);
    updateCards.mutate({
      accountId: account.id,
      creditCardIds: selectedIds.filter((id) => selectableIds.includes(id)),
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-md overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            Credit cards for{" "}
            {account ? formatGoogleAccountTitle(account) : "Google account"}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <CreditCardLinkChecklist
            selectedIds={selectedIds}
            onToggle={toggleCard}
            accountId={account?.id ?? null}
            googleAccounts={googleAccounts}
            idPrefix="google-manage-card"
            lockLinkedToOtherAccounts
          />
          <Button
            className="w-full"
            onClick={handleSave}
            disabled={updateCards.isPending || !account}
          >
            {updateCards.isPending ? "Saving…" : "Save"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function GoogleAccountsSettings() {
  const utils = api.useUtils();
  const { data: googleAccounts, isLoading } =
    api.integrations.listGoogleAccounts.useQuery();
  const disconnect = api.integrations.disconnectGoogleAccount.useMutation({
    onSuccess: () => {
      toast.success("Google account disconnected");
      void utils.integrations.listGoogleAccounts.invalidate();
      void utils.integrations.list.invalidate();
      void utils.creditCards.list.invalidate();
      setDisconnectId(null);
    },
    onError: (e) => toast.error(e.message),
  });

  const [connectOpen, setConnectOpen] = useState(false);
  const [manageAccount, setManageAccount] =
    useState<GoogleAccountOption | null>(null);
  const [reconnectAccountId, setReconnectAccountId] = useState<string | null>(
    null,
  );
  const [disconnectId, setDisconnectId] = useState<string | null>(null);
  const [initialCardIds, setInitialCardIds] = useState<string[]>([]);

  const { data: cards } = api.creditCards.list.useQuery();

  const accountOptions: GoogleAccountOption[] = useMemo(
    () =>
      (googleAccounts ?? []).map((account) => ({
        id: account.id,
        name: account.name,
        email: account.email,
        isDefault: account.isDefault,
      })),
    [googleAccounts],
  );

  function openConnect(options?: {
    accountId?: string | null;
    creditCardIds?: string[];
  }) {
    setReconnectAccountId(options?.accountId ?? null);
    setInitialCardIds(options?.creditCardIds ?? []);
    setConnectOpen(true);
  }

  function linkedCardIdsForAccount(accountId: string, isDefault: boolean) {
    if (!cards) return [];
    return resolveLinkedCardIds(cards, accountId, isDefault);
  }

  const hasAccounts = (googleAccounts?.length ?? 0) > 0;

  return (
    <>
      <div className="space-y-3">
        {isLoading ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : hasAccounts ? (
          <ul className="space-y-2">
            {googleAccounts!.map((account) => (
              <li
                key={account.id}
                className="flex flex-wrap gap-3 justify-between items-center p-3 rounded-lg border border-border"
              >
                <div className="space-y-1 min-w-0">
                  <p className="text-sm font-medium truncate">
                    {formatGoogleAccountTitle(account)}
                  </p>
                  {formatGoogleAccountSubtitle(account) ? (
                    <p className="text-xs truncate text-muted-foreground">
                      {formatGoogleAccountSubtitle(account)}
                    </p>
                  ) : null}
                  <p className="text-xs text-muted-foreground">
                    {account.linkedCardCount} card
                    {account.linkedCardCount === 1 ? "" : "s"}
                    {account.isDefault ? " · default" : ""}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2 items-center">
                  {account.hasRefreshToken ? (
                    <StatusBadge label="Connected" variant="success" />
                  ) : (
                    <StatusBadge label="Reconnect" variant="warning" />
                  )}
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() =>
                      setManageAccount({
                        id: account.id,
                        name: account.name,
                        email: account.email,
                        isDefault: account.isDefault,
                      })
                    }
                  >
                    Cards
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() =>
                      openConnect({
                        accountId: account.id,
                        creditCardIds: linkedCardIdsForAccount(
                          account.id,
                          account.isDefault,
                        ),
                      })
                    }
                  >
                    Reconnect
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setDisconnectId(account.id)}
                  >
                    Disconnect
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground">No Google accounts</p>
        )}
        <Button
          type="button"
          variant={hasAccounts ? "outline" : "default"}
          onClick={() => openConnect()}
        >
          {hasAccounts ? "Add Google account" : "Connect Google"}
        </Button>
      </div>

      <ConnectGoogleAccountDialog
        open={connectOpen}
        onOpenChange={setConnectOpen}
        initialCreditCardIds={initialCardIds}
        reconnectAccountId={reconnectAccountId}
        googleAccounts={accountOptions}
      />

      <ManageGoogleAccountCardsDialog
        open={!!manageAccount}
        onOpenChange={(open) => !open && setManageAccount(null)}
        account={manageAccount}
        googleAccounts={accountOptions}
      />

      <ConfirmDialog
        open={!!disconnectId}
        onOpenChange={(open) => !open && setDisconnectId(null)}
        title="Disconnect Google account?"
        description="Linked credit cards will no longer use this Gmail inbox for SOA fetch."
        confirmLabel="Disconnect"
        variant="destructive"
        onConfirm={() => {
          if (disconnectId) disconnect.mutate({ accountId: disconnectId });
        }}
      />
    </>
  );
}
