"use client";

import { useState } from "react";
import { signIn } from "next-auth/react";

import { ROUTES } from "@/config/routes";
import { closeGoogleReconnectModal } from "@/lib/auth/google-reconnect-store";

type ReconnectGoogleOptions = {
  callbackUrl?: string;
};

export function useReconnectGoogle() {
  const [isPending, setIsPending] = useState(false);

  async function reconnectGoogle(options?: ReconnectGoogleOptions) {
    setIsPending(true);
    closeGoogleReconnectModal();
    const callbackUrl =
      options?.callbackUrl ??
      (typeof window !== "undefined"
        ? window.location.href
        : ROUTES.dashboard.settings);

    await signIn("google", { callbackUrl });
  }

  return { reconnectGoogle, isReconnectPending: isPending };
}
