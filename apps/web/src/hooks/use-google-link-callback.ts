"use client";

import { useEffect } from "react";
import { toast } from "sonner";

import { api } from "@/lib/api/client";

type UseGoogleLinkCallbackOptions = {
  onSuccess?: (accountId: string | null) => void;
};

export function useGoogleLinkCallback(options?: UseGoogleLinkCallbackOptions) {
  const utils = api.useUtils();

  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    const status = params.get("googleLink");
    if (!status) return;

    const message = params.get("googleLinkMessage");
    const accountId = params.get("googleAccountId");

    if (status === "success") {
      toast.success("Google account connected");
      void utils.integrations.listGoogleAccounts.invalidate();
      options?.onSuccess?.(accountId);
    } else if (status === "error") {
      toast.error(message ?? "Google connect failed");
    }

    params.delete("googleLink");
    params.delete("googleLinkMessage");
    params.delete("googleAccountId");
    const next = `${window.location.pathname}${
      params.toString() ? `?${params.toString()}` : ""
    }`;
    window.history.replaceState({}, "", next);
  }, [options?.onSuccess, utils]);
}
