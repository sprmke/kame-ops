"use client";

import { useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { ConfirmDialog } from "@/components/shared/ConfirmDialog";
import { TransactionCategoryRulesContentSkeleton } from "@/components/shared/skeletons";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { api } from "@/lib/api/client";

export function CustomTransactionCategoriesSettings() {
  const utils = api.useUtils();
  const { data: customCategories, isLoading } =
    api.transactionCategories.listUserCategories.useQuery();
  const [label, setLabel] = useState("");
  const [deleteSlug, setDeleteSlug] = useState<string | null>(null);

  const createCategory = api.transactionCategories.createCategory.useMutation({
    onSuccess: () => {
      setLabel("");
      void utils.transactionCategories.listUserCategories.invalidate();
      void utils.transactionCategories.listOptions.invalidate();
      toast.success("Category added");
    },
    onError: (e) => toast.error(e.message),
  });

  const deleteCategory = api.transactionCategories.deleteCategory.useMutation({
    onSuccess: () => {
      setDeleteSlug(null);
      void utils.transactionCategories.listUserCategories.invalidate();
      void utils.transactionCategories.listOptions.invalidate();
      void utils.transactionCategories.listRules.invalidate();
      toast.success("Category removed");
    },
    onError: (e) => toast.error(e.message),
  });

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Custom categories</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <form
            className="flex flex-col gap-2 sm:flex-row"
            onSubmit={(e) => {
              e.preventDefault();
              const trimmed = label.trim();
              if (trimmed.length < 2) return;
              createCategory.mutate({ label: trimmed });
            }}
          >
            <Input
              placeholder="Category name"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              maxLength={64}
              className="sm:flex-1"
            />
            <Button
              type="submit"
              disabled={createCategory.isPending || label.trim().length < 2}
            >
              <Plus className="mr-2 h-4 w-4" />
              Add
            </Button>
          </form>

          {isLoading ? (
            <TransactionCategoryRulesContentSkeleton />
          ) : !customCategories?.length ? (
            <p className="text-sm text-muted-foreground">
              No custom categories.
            </p>
          ) : (
            <ul className="divide-y divide-border/60 rounded-lg border border-border/80">
              {customCategories.map((category) => (
                <li
                  key={category.id}
                  className="flex items-center justify-between gap-3 px-3 py-2.5 text-sm"
                >
                  <span className="font-medium">{category.label}</span>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="shrink-0"
                    aria-label={`Delete ${category.label}`}
                    onClick={() => setDeleteSlug(category.slug)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <ConfirmDialog
        open={deleteSlug !== null}
        onOpenChange={(open) => {
          if (!open) setDeleteSlug(null);
        }}
        title="Remove category?"
        description="Rules using this category are removed. Existing transaction labels stay as-is."
        confirmLabel="Remove"
        variant="destructive"
        isLoading={deleteCategory.isPending}
        onConfirm={() => {
          if (deleteSlug) deleteCategory.mutate({ slug: deleteSlug });
        }}
      />
    </>
  );
}
