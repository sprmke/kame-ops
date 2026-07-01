"use client";

import { useEffect, useState } from "react";
import { Sparkles } from "lucide-react";
import { toast } from "sonner";

import { AiKeysCardSkeleton } from "@/components/shared/skeletons";
import { StatusBadge } from "@/components/shared/StatusBadge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { PasswordInput } from "@/components/ui/password-input";
import type { AiKeyProvider } from "@/lib/ai/types";
import { api } from "@/lib/api/client";

function ProviderKeysField({
  provider,
  label,
  model,
  savedKeyCount,
  value,
  onChange,
  onSave,
  onTest,
  saving,
  testing,
  canTest,
}: {
  provider: AiKeyProvider;
  label: string;
  model: string;
  savedKeyCount: number;
  value: string;
  onChange: (value: string) => void;
  onSave: () => void;
  onTest: () => void;
  saving: boolean;
  testing: boolean;
  canTest: boolean;
}) {
  const hasDraft = value.trim().length > 0;
  const testEnabled = canTest && !hasDraft;
  const placeholder =
    savedKeyCount > 0
      ? `${savedKeyCount} key${savedKeyCount > 1 ? "s" : ""} saved — paste to replace`
      : "key1, key2, …";

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <Label htmlFor={`${provider}-keys`}>
          {label}
          <span className="ml-2 font-normal font-mono text-xs text-muted-foreground">
            {model}
          </span>
        </Label>
        {savedKeyCount > 0 && !hasDraft ? (
          <StatusBadge label={`${savedKeyCount} saved`} variant="success" />
        ) : null}
      </div>
      <PasswordInput
        id={`${provider}-keys`}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        autoComplete="off"
      />
      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          className="flex-1 sm:flex-none"
          disabled={saving || !hasDraft}
          onClick={onSave}
        >
          {saving ? "Saving…" : `Save ${label}`}
        </Button>
        <Button
          type="button"
          variant="outline"
          className="flex-1 sm:flex-none"
          disabled={testing || !testEnabled}
          onClick={onTest}
        >
          {testing ? "Testing…" : "Test"}
        </Button>
      </div>
    </div>
  );
}

export function AiApiKeysSettings() {
  const utils = api.useUtils();
  const { data: formConfig, isLoading } = api.aiKeys.getFormConfig.useQuery();

  const [geminiInput, setGeminiInput] = useState("");
  const [groqInput, setGroqInput] = useState("");

  useEffect(() => {
    if (!formConfig?.secretsUnavailable) return;
    toast.error(
      "Some API keys could not be decrypted. Re-enter them and save.",
    );
  }, [formConfig?.secretsUnavailable]);

  const saveGemini = api.aiKeys.save.useMutation({
    onSuccess: (result) => {
      setGeminiInput("");
      toast.success(
        result.keyCount > 0
          ? `${result.keyCount} Gemini key${result.keyCount > 1 ? "s" : ""} saved`
          : "Gemini keys cleared",
      );
      void utils.aiKeys.getFormConfig.invalidate();
    },
    onError: (e) => toast.error(e.message),
  });

  const saveGroq = api.aiKeys.save.useMutation({
    onSuccess: (result) => {
      setGroqInput("");
      toast.success(
        result.keyCount > 0
          ? `${result.keyCount} Groq key${result.keyCount > 1 ? "s" : ""} saved`
          : "Groq keys cleared",
      );
      void utils.aiKeys.getFormConfig.invalidate();
    },
    onError: (e) => toast.error(e.message),
  });

  const verifyGemini = api.aiKeys.verify.useMutation({
    onSuccess: ({ results }) => {
      if (results.length === 0) {
        toast.error("No Gemini keys to test");
        return;
      }
      const ok = results.filter((r) => r.ok).length;
      if (ok === results.length) {
        toast.success(
          `All ${results.length} Gemini key${results.length > 1 ? "s" : ""} connected`,
        );
        return;
      }
      toast.error(`${ok}/${results.length} Gemini keys connected`);
    },
    onError: (e) => toast.error(e.message),
  });

  const verifyGroq = api.aiKeys.verify.useMutation({
    onSuccess: ({ results }) => {
      if (results.length === 0) {
        toast.error("No Groq keys to test");
        return;
      }
      const ok = results.filter((r) => r.ok).length;
      if (ok === results.length) {
        toast.success(
          `All ${results.length} Groq key${results.length > 1 ? "s" : ""} connected`,
        );
        return;
      }
      toast.error(`${ok}/${results.length} Groq keys connected`);
    },
    onError: (e) => toast.error(e.message),
  });

  if (isLoading) {
    return <AiKeysCardSkeleton />;
  }

  const geminiSavedCount = formConfig?.gemini.keyCount ?? 0;
  const groqSavedCount = formConfig?.groq.keyCount ?? 0;

  return (
    <Card className="lg:col-span-2">
      <CardHeader>
        <div className="flex items-center gap-2">
          <Sparkles className="h-5 w-5 text-primary" />
          <CardTitle className="text-base">Receipt AI</CardTitle>
        </div>
      </CardHeader>
      <CardContent className="grid gap-6 sm:grid-cols-2">
        <ProviderKeysField
          provider="gemini"
          label="Gemini"
          model={formConfig?.gemini.model ?? ""}
          savedKeyCount={geminiSavedCount}
          value={geminiInput}
          onChange={setGeminiInput}
          saving={saveGemini.isPending}
          testing={verifyGemini.isPending}
          canTest={geminiSavedCount > 0}
          onSave={() =>
            saveGemini.mutate({ provider: "gemini", keys: geminiInput })
          }
          onTest={() =>
            verifyGemini.mutate({ provider: "gemini", keys: undefined })
          }
        />
        <ProviderKeysField
          provider="groq"
          label="Groq"
          model={formConfig?.groq.model ?? ""}
          savedKeyCount={groqSavedCount}
          value={groqInput}
          onChange={setGroqInput}
          saving={saveGroq.isPending}
          testing={verifyGroq.isPending}
          canTest={groqSavedCount > 0}
          onSave={() => saveGroq.mutate({ provider: "groq", keys: groqInput })}
          onTest={() =>
            verifyGroq.mutate({ provider: "groq", keys: undefined })
          }
        />
      </CardContent>
    </Card>
  );
}
