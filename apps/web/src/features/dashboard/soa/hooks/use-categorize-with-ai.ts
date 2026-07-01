"use client";

import { toast } from "sonner";

import { api } from "@/lib/api/client";
import { AI_SKIP_NO_KEYS_MESSAGE } from "@/lib/receipts/ai-skip";

type CategorizeSuccessResult = {
  updated: number;
  createdCategories: number;
  skipped: number;
  merchantGroups?: number;
  aiBatches?: number;
};

export function useCategorizeWithAiToast() {
  return {
    onSuccess(result: CategorizeSuccessResult, onClose?: () => void) {
      onClose?.();

      if (result.updated === 0) {
        toast.message("No transactions updated");
        return;
      }

      const parts = [`${result.updated} categorized`];
      if (result.createdCategories > 0) {
        parts.push(
          `${result.createdCategories} new ${result.createdCategories === 1 ? "category" : "categories"}`,
        );
      }
      toast.success(parts.join(" · "));
    },
    onError(error: { message: string }) {
      if (error.message === AI_SKIP_NO_KEYS_MESSAGE) {
        toast.error(AI_SKIP_NO_KEYS_MESSAGE);
        return;
      }
      toast.error(error.message);
    },
  };
}

export function useInvalidateAfterCategorize() {
  const utils = api.useUtils();

  return async (options?: { periodId?: string; statementId?: string }) => {
    const tasks = [
      utils.transactionCategories.listOptions.invalidate(),
      utils.soa.listPeriods.invalidate(),
    ];
    if (options?.periodId) {
      tasks.push(
        utils.soa.getPeriod.invalidate({ periodId: options.periodId }),
      );
    }
    if (options?.periodId && options?.statementId) {
      tasks.push(
        utils.soa.getStatement.invalidate({
          periodId: options.periodId,
          statementId: options.statementId,
        }),
      );
    }
    await Promise.all(tasks);
  };
}
