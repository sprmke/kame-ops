"use client";

import { useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";

import { TransactionCategoryRulesContentSkeleton } from "@/components/shared/skeletons";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { api } from "@/lib/api/client";

export function TransactionCategoryRulesSettings() {
  const utils = api.useUtils();
  const { data: rules, isLoading } =
    api.transactionCategories.listRules.useQuery();
  const { data: options } = api.transactionCategories.listOptions.useQuery();

  const [keyword, setKeyword] = useState("");
  const [categorySlug, setCategorySlug] = useState("store_shopping");

  const createRule = api.transactionCategories.createRule.useMutation({
    onSuccess: () => {
      setKeyword("");
      void utils.transactionCategories.listRules.invalidate();
      toast.success("Rule added");
    },
    onError: (e) => toast.error(e.message),
  });

  const deleteRule = api.transactionCategories.deleteRule.useMutation({
    onSuccess: () => {
      void utils.transactionCategories.listRules.invalidate();
      toast.success("Rule removed");
    },
    onError: (e) => toast.error(e.message),
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Category rules</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <form
          className="flex flex-col gap-2 sm:flex-row"
          onSubmit={(e) => {
            e.preventDefault();
            if (!keyword.trim()) return;
            createRule.mutate({ keyword: keyword.trim(), categorySlug });
          }}
        >
          <Input
            placeholder="Keyword (e.g. SHOPEE)"
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
            className="sm:flex-1"
          />
          <Select value={categorySlug} onValueChange={setCategorySlug}>
            <SelectTrigger className="sm:w-[200px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {options
                ?.filter((o) => o.slug !== "unknown")
                .map((opt) => (
                  <SelectItem key={opt.slug} value={opt.slug}>
                    {opt.label}
                  </SelectItem>
                ))}
            </SelectContent>
          </Select>
          <Button
            type="submit"
            disabled={createRule.isPending || !keyword.trim()}
          >
            <Plus className="mr-2 h-4 w-4" />
            Add
          </Button>
        </form>

        {isLoading ? (
          <TransactionCategoryRulesContentSkeleton />
        ) : !rules?.length ? (
          <p className="text-sm text-muted-foreground">No custom rules yet.</p>
        ) : (
          <ul className="max-h-80 divide-y divide-border/60 overflow-y-auto rounded-lg border border-border/80">
            {rules.map((rule) => (
              <li
                key={rule.id}
                className="flex items-center justify-between gap-3 px-3 py-2.5 text-sm"
              >
                <div className="min-w-0">
                  <span className="font-mono text-xs font-medium">
                    {rule.keyword}
                  </span>
                  <span className="mx-2 text-muted-foreground">→</span>
                  <span>
                    {options?.find((o) => o.slug === rule.categorySlug)
                      ?.label ?? rule.categorySlug}
                  </span>
                  {rule.source === "learned" && (
                    <span className="ml-2 text-xs text-muted-foreground">
                      learned
                    </span>
                  )}
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  className="shrink-0"
                  aria-label="Delete rule"
                  onClick={() => deleteRule.mutate({ ruleId: rule.id })}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
