"use client";

import { useState } from "react";
import { toast } from "sonner";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectSeparator,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { api } from "@/lib/api/client";
import {
  CANNOT_ANALYZE_SLUG,
  type TransactionCategorySlug,
} from "@/lib/transactions/categories";
import { cn } from "@/lib/utils/cn";

import { AddTransactionCategoryField } from "./AddTransactionCategoryField";

/** Fixed trigger width so every row aligns in the transaction table. */
export const TRANSACTION_CATEGORY_SELECT_WIDTH_CLASS =
  "w-[11rem] max-w-[11rem]";

type TransactionCategorySelectProps = {
  transactionId: string;
  value: TransactionCategorySlug | string;
  editable?: boolean;
  className?: string;
  onUpdated?: () => void;
};

export function TransactionCategorySelect({
  transactionId,
  value,
  editable = true,
  className,
  onUpdated,
}: TransactionCategorySelectProps) {
  const utils = api.useUtils();
  const [open, setOpen] = useState(false);
  const { data: options } = api.transactionCategories.listOptions.useQuery();

  const update =
    api.transactionCategories.updateTransactionCategory.useMutation({
      onSuccess: () => {
        void utils.soa.getStatement.invalidate();
        void utils.soa.getPeriod.invalidate();
        void utils.transactionCategories.listOptions.invalidate();
        onUpdated?.();
      },
      onError: (e) => toast.error(e.message),
    });

  function assignCategory(slug: string, learn = true) {
    update.mutate({
      transactionId,
      categorySlug: slug,
      learn,
    });
  }

  if (!editable) {
    return (
      <span className={cn("text-sm", className)}>
        {options?.find((o) => o.slug === value)?.label ?? value}
      </span>
    );
  }

  return (
    <Select
      open={open}
      onOpenChange={setOpen}
      value={value}
      onValueChange={(slug) => {
        assignCategory(slug);
      }}
      disabled={update.isPending}
    >
      <SelectTrigger
        className={cn(
          "h-8 border-dashed text-xs",
          TRANSACTION_CATEGORY_SELECT_WIDTH_CLASS,
          value === CANNOT_ANALYZE_SLUG && "text-muted-foreground",
          className,
        )}
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => e.stopPropagation()}
      >
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {options?.map((opt) => (
          <SelectItem key={opt.slug} value={opt.slug} className="text-xs">
            {opt.label}
          </SelectItem>
        ))}
        <SelectSeparator />
        <AddTransactionCategoryField
          compact
          onCreated={(slug) => {
            assignCategory(slug, false);
            setOpen(false);
          }}
        />
      </SelectContent>
    </Select>
  );
}
