"use client";

import { useEffect } from "react";
import { useSession } from "next-auth/react";

import { api, backgroundQuery } from "@/lib/api/client";
import {
  closeGoogleReconnectModal,
  openGoogleReconnectModal,
} from "@/lib/auth/google-reconnect-store";

/** Proactively surfaces the reconnect modal when stored Google tokens are invalid. */
export function GoogleReconnectMonitor() {
  const { status } = useSession();
  const enabled = status === "authenticated";

  const { data } = api.integrations.checkGoogleAuth.useQuery(undefined, {
    enabled,
    refetchOnWindowFocus: false,
    refetchInterval: 5 * 60_000,
    staleTime: 5 * 60_000,
    retry: false,
    trpc: backgroundQuery,
  });

  useEffect(() => {
    if (!enabled || !data) return;
    if (!data.ok) {
      openGoogleReconnectModal(data.message);
      return;
    }
    closeGoogleReconnectModal();
  }, [data, enabled]);

  return null;
}
