"use client";

import { useState } from "react";
import { Activity, Sparkles } from "lucide-react";
import { toast } from "sonner";

import { StatusBadge } from "@/components/shared/StatusBadge";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api/client";
import type { GeminiIntegrationVerifyResult } from "@/lib/receipts/types";

export function ReceiptAiIntegrationCard() {
  const { data: status, isLoading } =
    api.integrations.receiptAiStatus.useQuery();
  const verify = api.integrations.verifyReceiptAi.useMutation();
  const [lastResult, setLastResult] =
    useState<GeminiIntegrationVerifyResult | null>(null);

  const configured = status?.geminiApiKeyConfigured ?? false;
  const tested = lastResult != null;
  const connected = lastResult?.ok === true;

  return (
    <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex min-w-0 items-start gap-3">
        <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
          <Sparkles className="size-5" aria-hidden />
        </div>
        <div className="min-w-0 space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <StatusBadge
              label={
                !configured
                  ? "Not configured"
                  : tested
                    ? connected
                      ? "Connected"
                      : "Failed"
                    : "Ready"
              }
              variant={
                !configured
                  ? "muted"
                  : tested
                    ? connected
                      ? "success"
                      : "destructive"
                    : "warning"
              }
            />
            {status?.geminiKeysCount ? (
              <StatusBadge
                label={`${status.geminiKeysCount} Gemini key${status.geminiKeysCount > 1 ? "s" : ""}`}
                variant="muted"
              />
            ) : null}
            {status?.groqApiKeyConfigured ? (
              <StatusBadge label="Groq fallback" variant="muted" />
            ) : null}
          </div>
          {tested && connected && lastResult.latencyMs != null ? (
            <p className="text-xs text-muted-foreground">
              {lastResult.latencyMs} ms · {lastResult.model}
            </p>
          ) : null}
          {tested && !connected ? (
            <p className="text-xs text-destructive">
              {lastResult.error ?? "Connection test failed"}
            </p>
          ) : null}
        </div>
      </div>

      <Button
        type="button"
        variant="outline"
        className="w-full sm:w-auto"
        disabled={isLoading || verify.isPending || !configured}
        onClick={() =>
          verify.mutate(undefined, {
            onSuccess: (result) => {
              setLastResult(result);
              if (result.ok) {
                toast.success("Receipt AI connected");
              } else {
                toast.error("Receipt AI connection failed", {
                  description: result.error,
                });
              }
            },
            onError: (e) => toast.error(e.message),
          })
        }
      >
        <Activity className="mr-2 size-4" aria-hidden />
        {verify.isPending ? "Testing…" : "Test connection"}
      </Button>
    </div>
  );
}
