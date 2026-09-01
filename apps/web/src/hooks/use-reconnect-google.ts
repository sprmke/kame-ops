"use client";

import { useState } from "react";

import { ROUTES } from "@/config/routes";
import { api } from "@/lib/api/client";
import { closeGoogleReconnectModal } from "@/lib/auth/google-reconnect-store";

type ReconnectGoogleOptions = {
  callbackUrl?: string;
  creditCardIds?: string[];
};

export function useReconnectGoogle() {
  const [isPending, setIsPending] = useState(false);
  const getLinkUrl = api.integrations.getGoogleLinkUrl.useMutation();

  async function reconnectGoogle(options?: ReconnectGoogleOptions) {
    setIsPending(true);
    const callbackUrl =
      options?.callbackUrl ??
      (typeof window !== "undefined"
        ? window.location.href
        : ROUTES.dashboard.settings);

    try {
      const result = await getLinkUrl.mutateAsync({
        callbackUrl,
        creditCardIds: options?.creditCardIds,
      });
      closeGoogleReconnectModal();
      window.location.href = result.url;
    } finally {
      setIsPending(false);
    }
  }

  return { reconnectGoogle, isReconnectPending: isPending };
}
