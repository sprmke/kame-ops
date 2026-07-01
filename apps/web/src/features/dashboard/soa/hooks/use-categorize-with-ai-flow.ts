"use client";

import { useState } from "react";

import type { AiCategorizeScope } from "@/lib/transactions/ai-categorize-payload";
import type { AiCategorizeSettled } from "@/hooks/use-ai-categorize-progress";
import { api } from "@/lib/api/client";

import {
  useCategorizeWithAiToast,
  useInvalidateAfterCategorize,
} from "./use-categorize-with-ai";

type InvalidateOptions = {
  periodId?: string;
  statementId?: string;
};

export function useCategorizeWithAiFlow(invalidateOptions?: InvalidateOptions) {
  const categorizeToast = useCategorizeWithAiToast();
  const invalidateAfterCategorize = useInvalidateAfterCategorize();

  const [choiceOpen, setChoiceOpen] = useState(false);
  const [progressOpen, setProgressOpen] = useState(false);
  const [processId, setProcessId] = useState<string | null>(null);
  const [settled, setSettled] = useState<AiCategorizeSettled>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const periodMutation =
    api.transactionCategories.categorizePeriodWithAi.useMutation({
      onSuccess: async (result) => {
        setSettled("success");
        categorizeToast.onSuccess(result);
        await invalidateAfterCategorize(invalidateOptions);
      },
      onError: (error) => {
        setErrorMessage(error.message);
        setSettled("error");
        categorizeToast.onError(error);
      },
    });

  const statementMutation =
    api.transactionCategories.categorizeStatementWithAi.useMutation({
      onSuccess: async (result) => {
        setSettled("success");
        categorizeToast.onSuccess(result);
        await invalidateAfterCategorize(invalidateOptions);
      },
      onError: (error) => {
        setErrorMessage(error.message);
        setSettled("error");
        categorizeToast.onError(error);
      },
    });

  const isPending = periodMutation.isPending || statementMutation.isPending;

  function beginRun() {
    const id = crypto.randomUUID();
    setProcessId(id);
    setSettled(null);
    setErrorMessage(null);
    setProgressOpen(true);
    setChoiceOpen(false);
    return id;
  }

  function startPeriodCategorize(periodId: string, scope: AiCategorizeScope) {
    const id = beginRun();
    periodMutation.mutate({ periodId, scope, processId: id });
  }

  function startStatementCategorize(
    statementId: string,
    scope: AiCategorizeScope,
  ) {
    const id = beginRun();
    statementMutation.mutate({ statementId, scope, processId: id });
  }

  function handleProgressComplete() {
    setProgressOpen(false);
    setProcessId(null);
    setSettled(null);
    setErrorMessage(null);
  }

  function handleProgressOpenChange(open: boolean) {
    if (!open && isPending) return;
    if (!open && settled === "success") return;
    if (!open) {
      handleProgressComplete();
    } else {
      setProgressOpen(open);
    }
  }

  return {
    choiceOpen,
    setChoiceOpen,
    progressOpen,
    processId,
    settled,
    errorMessage,
    isPending,
    startPeriodCategorize,
    startStatementCategorize,
    handleProgressComplete,
    handleProgressOpenChange,
  };
}
