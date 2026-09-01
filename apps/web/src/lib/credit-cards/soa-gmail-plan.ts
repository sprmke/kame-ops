import { formatGoogleAccountLabel } from "@/lib/google/google-account-display";

type SoaGmailPlanCard = {
  isActive: boolean;
  googleAccountId: string | null;
};

type SoaGmailPlanAccount = {
  id: string;
  isDefault: boolean;
  email: string | null;
  name: string | null;
};

export function computeSoaGmailPlan(
  cards: SoaGmailPlanCard[] | undefined,
  accounts: SoaGmailPlanAccount[] | undefined,
) {
  const activeCards = (cards ?? []).filter((card) => card.isActive);
  const defaultId =
    accounts?.find((account) => account.isDefault)?.id ?? accounts?.[0]?.id;
  const inboxIds = new Set<string>();

  for (const card of activeCards) {
    const resolved = card.googleAccountId ?? defaultId;
    if (resolved) inboxIds.add(resolved);
  }

  const inboxes = [...inboxIds]
    .map((id) => accounts?.find((account) => account.id === id))
    .filter((account): account is SoaGmailPlanAccount => !!account)
    .map((account) => formatGoogleAccountLabel(account));

  return {
    activeCardCount: activeCards.length,
    inboxCount: inboxIds.size,
    inboxes,
  };
}
