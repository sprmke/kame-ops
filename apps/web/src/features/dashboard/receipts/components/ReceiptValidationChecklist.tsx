"use client";

import { useState } from "react";
import { CheckCircle2, ChevronDown, HelpCircle, XCircle } from "lucide-react";

import { cn } from "@/lib/utils/cn";

import {
  buildReceiptValidationChecks,
  type ChecklistState,
} from "../lib/receipt-display";
import type { ReceiptListItem } from "../lib/receipt-utils";
import { ReceiptAiVerdictBadge } from "./ReceiptAiVerdictBadge";

function ChecklistIcon({ state }: { state: ChecklistState }) {
  const className = "h-3.5 w-3.5 shrink-0";
  if (state === "pass") {
    return (
      <CheckCircle2
        className={cn(className, "text-[hsl(var(--success))]")}
        aria-hidden
      />
    );
  }
  if (state === "fail") {
    return (
      <XCircle className={cn(className, "text-destructive")} aria-hidden />
    );
  }
  return (
    <HelpCircle
      className={cn(className, "text-muted-foreground/70")}
      aria-hidden
    />
  );
}

type ReceiptValidationChecklistProps = {
  receipt: ReceiptListItem;
  className?: string;
  compact?: boolean;
  defaultOpen?: boolean;
  alwaysExpanded?: boolean;
};

export function ReceiptValidationChecklist({
  receipt,
  className,
  compact = false,
  defaultOpen = false,
  alwaysExpanded = false,
}: ReceiptValidationChecklistProps) {
  const [open, setOpen] = useState(defaultOpen || alwaysExpanded);
  const checks = buildReceiptValidationChecks(receipt);
  const verdict = receipt.aiVerdict;
  const modelError = receipt.aiAnalysis?.aiModelError;

  if ((!verdict || verdict === "skipped") && !alwaysExpanded) return null;

  if ((!verdict || verdict === "skipped") && alwaysExpanded) {
    return (
      <div
        className={cn(
          "overflow-hidden rounded-lg border border-border/80 bg-muted/10 p-3",
          className,
        )}
      >
        <p className="text-xs text-muted-foreground">
          {modelError ??
            receipt.aiSummary ??
            (verdict === "skipped"
              ? "AI validation unavailable"
              : "No AI validation yet")}
        </p>
      </div>
    );
  }

  const failCount = checks.filter((c) => c.state === "fail").length;

  if (alwaysExpanded) {
    return (
      <div
        className={cn(
          "overflow-hidden rounded-lg border border-border/80 bg-muted/10 p-3",
          className,
        )}
      >
        {modelError ? (
          <p className="mb-2 text-xs text-destructive">{modelError}</p>
        ) : null}
        {failCount > 0 ? (
          <p className="mb-2 text-xs text-muted-foreground">
            {failCount} check{failCount === 1 ? "" : "s"} failed
          </p>
        ) : null}
        <ul className="grid gap-x-4 gap-y-1 sm:grid-cols-2">
          {checks.map((check) => (
            <li
              key={check.id}
              className="flex items-center gap-1.5 text-xs leading-snug"
            >
              <ChecklistIcon state={check.state} />
              <span
                className={cn(
                  "min-w-0 truncate",
                  check.state === "fail" && "text-destructive",
                  check.state === "pass" && "text-foreground",
                  check.state === "unknown" && "text-muted-foreground",
                )}
              >
                {check.label}
              </span>
            </li>
          ))}
        </ul>
        {receipt.aiSummary ? (
          <p className="mt-3 border-t border-border/60 pt-2 text-[11px] leading-snug text-muted-foreground">
            {receipt.aiSummary}
          </p>
        ) : null}
      </div>
    );
  }

  return (
    <div
      className={cn(
        "overflow-hidden rounded-md border border-border/60 bg-muted/10",
        className,
      )}
    >
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        className={cn(
          "flex w-full items-center justify-between gap-2 text-left transition-colors hover:bg-muted/25",
          compact ? "px-2 py-1.5" : "px-3 py-2",
        )}
      >
        <span
          className={cn(
            "font-medium text-muted-foreground",
            compact ? "text-[10px]" : "text-xs",
          )}
        >
          AI validation
        </span>
        <span className="flex shrink-0 items-center gap-1.5">
          <ReceiptAiVerdictBadge verdict={verdict} compact />
          <ChevronDown
            className={cn(
              "h-3.5 w-3.5 text-muted-foreground transition-transform",
              open && "rotate-180",
            )}
            aria-hidden
          />
        </span>
      </button>

      {open ? (
        <div
          className={cn(
            "border-t border-border/60",
            compact ? "space-y-1.5 p-2 pt-1.5" : "space-y-2 p-3 pt-2",
          )}
        >
          {failCount > 0 ? (
            <p
              className={cn(
                "text-muted-foreground",
                compact ? "text-[10px]" : "text-xs",
              )}
            >
              {failCount} check{failCount === 1 ? "" : "s"} failed
            </p>
          ) : null}

          <ul
            className={cn(
              compact
                ? "grid grid-cols-1 gap-x-3 gap-y-1 sm:grid-cols-2"
                : "space-y-1.5",
            )}
          >
            {checks.map((check) => (
              <li
                key={check.id}
                className={cn(
                  "flex items-center gap-1.5 leading-snug",
                  compact ? "text-[10px]" : "text-xs",
                )}
              >
                <ChecklistIcon state={check.state} />
                <span
                  className={cn(
                    "min-w-0 truncate",
                    check.state === "fail" && "text-destructive",
                    check.state === "pass" && "text-foreground",
                    check.state === "unknown" && "text-muted-foreground",
                  )}
                >
                  {check.label}
                </span>
              </li>
            ))}
          </ul>

          {receipt.aiSummary ? (
            <p
              className={cn(
                "border-t border-border/60 pt-1.5 leading-snug text-muted-foreground",
                compact ? "text-[10px]" : "text-[11px]",
              )}
            >
              {receipt.aiSummary}
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
