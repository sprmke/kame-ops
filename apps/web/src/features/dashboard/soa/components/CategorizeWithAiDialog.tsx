"use client";

import { Sparkles } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

import type { AiCategorizeScope } from "@/lib/transactions/ai-categorize-payload";

export type { AiCategorizeScope };

type CategorizeWithAiDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  unknownCount: number;
  allEligibleCount: number;
  onSelectScope: (scope: AiCategorizeScope) => void;
  isPending?: boolean;
};

export function CategorizeWithAiDialog({
  open,
  onOpenChange,
  unknownCount,
  allEligibleCount,
  onSelectScope,
  isPending,
}: CategorizeWithAiDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="font-display">Categorize with AI</DialogTitle>
        </DialogHeader>
        <DialogFooter className="flex-col gap-2 sm:flex-col sm:space-x-0">
          <Button
            type="button"
            className="w-full"
            disabled={isPending || unknownCount === 0}
            onClick={() => onSelectScope("unknown_only")}
          >
            <Sparkles className="mr-2 h-4 w-4" />
            Cannot analyze only
            {unknownCount > 0 ? ` (${unknownCount})` : ""}
          </Button>
          <Button
            type="button"
            variant="outline"
            className="w-full"
            disabled={isPending || allEligibleCount === 0}
            onClick={() => onSelectScope("all")}
          >
            All transactions
            {allEligibleCount > 0 ? ` (${allEligibleCount})` : ""}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
