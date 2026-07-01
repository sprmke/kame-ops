"use client";

import { useState } from "react";
import { Plus } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { api } from "@/lib/api/client";

type AddTransactionCategoryFieldProps = {
  onCreated?: (slug: string) => void;
  compact?: boolean;
};

export function AddTransactionCategoryField({
  onCreated,
  compact = false,
}: AddTransactionCategoryFieldProps) {
  const utils = api.useUtils();
  const [adding, setAdding] = useState(false);
  const [label, setLabel] = useState("");

  const createCategory = api.transactionCategories.createCategory.useMutation({
    onSuccess: (row) => {
      void utils.transactionCategories.listOptions.invalidate();
      void utils.transactionCategories.listUserCategories.invalidate();
      setLabel("");
      setAdding(false);
      onCreated?.(row.slug);
      toast.success("Category added");
    },
    onError: (e) => toast.error(e.message),
  });

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    e.stopPropagation();
    const trimmed = label.trim();
    if (trimmed.length < 2) return;
    createCategory.mutate({ label: trimmed });
  }

  if (!adding) {
    return (
      <Button
        type="button"
        variant="ghost"
        size={compact ? "sm" : "default"}
        className="h-auto w-full justify-start px-2 py-1.5 text-xs font-normal"
        onPointerDown={(e) => e.preventDefault()}
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setAdding(true);
        }}
      >
        <Plus className="mr-2 h-3.5 w-3.5" />
        Add category
      </Button>
    );
  }

  return (
    <form
      className="flex items-center gap-1.5 p-1"
      onSubmit={handleSubmit}
      onPointerDown={(e) => e.stopPropagation()}
    >
      <Input
        autoFocus
        value={label}
        onChange={(e) => setLabel(e.target.value)}
        placeholder="Category name"
        className="h-8 text-xs"
        maxLength={64}
        onKeyDown={(e) => e.stopPropagation()}
      />
      <Button
        type="submit"
        size="sm"
        className="h-8 shrink-0 px-2 text-xs"
        disabled={createCategory.isPending || label.trim().length < 2}
      >
        Add
      </Button>
    </form>
  );
}
