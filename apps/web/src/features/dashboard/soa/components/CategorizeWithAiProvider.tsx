"use client";

import { createContext, useContext, useMemo } from "react";

import { CategorizeWithAiProgressDialog } from "@/components/shared/CategorizeWithAiProgressDialog";
import type { AiCategorizeScope } from "@/lib/transactions/ai-categorize-payload";
import { countEligibleTransactions } from "@/lib/transactions/ai-categorize-payload";

import { CategorizeWithAiDialog } from "./CategorizeWithAiDialog";
import { useCategorizeWithAiFlow } from "../hooks/use-categorize-with-ai-flow";

type CategorizeTransaction = {
  categorySlug?: string | null;
  categorySource?: string | null;
};

type CategorizeWithAiActions = {
  openChoiceDialog: () => void;
  analyzeUnanalyzed: () => void;
  selectScope: (scope: AiCategorizeScope) => void;
  isPending: boolean;
};

const CategorizeWithAiContext = createContext<CategorizeWithAiActions | null>(
  null,
);

export function useCategorizeWithAiActions(): CategorizeWithAiActions {
  const value = useContext(CategorizeWithAiContext);
  if (!value) {
    throw new Error(
      "useCategorizeWithAiActions must be used within CategorizeWithAiProvider",
    );
  }
  return value;
}

export function useOptionalCategorizeWithAiActions(): CategorizeWithAiActions | null {
  return useContext(CategorizeWithAiContext);
}

type CategorizeWithAiProviderProps = {
  periodId: string;
  statementId?: string;
  transactions: CategorizeTransaction[];
  children: React.ReactNode;
};

export function CategorizeWithAiProvider({
  periodId,
  statementId,
  transactions,
  children,
}: CategorizeWithAiProviderProps) {
  const flow = useCategorizeWithAiFlow({ periodId, statementId });

  const counts = useMemo(
    () => countEligibleTransactions(transactions),
    [transactions],
  );

  function selectScope(scope: AiCategorizeScope) {
    if (statementId) {
      flow.startStatementCategorize(statementId, scope);
      return;
    }
    flow.startPeriodCategorize(periodId, scope);
  }

  const actions: CategorizeWithAiActions = {
    openChoiceDialog: () => flow.setChoiceOpen(true),
    analyzeUnanalyzed: () => selectScope("unknown_only"),
    selectScope,
    isPending: flow.isPending,
  };

  return (
    <CategorizeWithAiContext value={actions}>
      {children}

      <CategorizeWithAiDialog
        open={flow.choiceOpen}
        onOpenChange={flow.setChoiceOpen}
        unknownCount={counts.unknownCount}
        allEligibleCount={counts.allEligibleCount}
        onSelectScope={selectScope}
        isPending={flow.isPending}
      />

      <CategorizeWithAiProgressDialog
        open={flow.progressOpen}
        onOpenChange={flow.handleProgressOpenChange}
        processId={flow.processId}
        isPending={flow.isPending}
        settled={flow.settled}
        errorMessage={flow.errorMessage}
        onComplete={flow.handleProgressComplete}
      />
    </CategorizeWithAiContext>
  );
}
