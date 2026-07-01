"use client";

import {
  CheckCircle2,
  Circle,
  FileText,
  Loader2,
  type LucideIcon,
  XCircle,
} from "lucide-react";

import { cn } from "@/lib/utils/cn";

export type WorkflowProgressStep = {
  id: string;
  label: string;
  status: "pending" | "active" | "done";
};

type WorkflowProgressPanelProps = {
  steps: WorkflowProgressStep[];
  activeStepIndex: number;
  progress: number;
  finished?: boolean;
  failed?: boolean;
  errorMessage?: string | null;
  detail?: string | null;
  icon?: LucideIcon;
  doneTitle?: string;
  failedTitle?: string;
  summaryLines?: string[];
};

function ProgressBar({ value }: { value: number }) {
  return (
    <div className="relative h-2.5 w-full overflow-hidden rounded-full bg-primary/20">
      <div
        className={cn(
          "h-full rounded-full transition-all duration-300 ease-out",
          value >= 100 ? "bg-[hsl(var(--success))]" : "bg-primary",
        )}
        style={{ width: `${Math.min(100, Math.max(0, value))}%` }}
      />
    </div>
  );
}

export function WorkflowProgressPanel({
  steps,
  activeStepIndex,
  progress,
  finished = false,
  failed = false,
  errorMessage,
  detail = null,
  icon: Icon = FileText,
  doneTitle = "All done",
  failedTitle = "Run failed",
  summaryLines,
}: WorkflowProgressPanelProps) {
  const current = steps[activeStepIndex] ?? steps[0];
  const done = finished && !failed;

  return (
    <div
      className="min-w-0 space-y-6 overflow-hidden py-2"
      aria-live="polite"
      aria-busy={!finished}
    >
      <div className="flex w-full min-w-0 flex-col items-center gap-4 pt-2 text-center">
        <div className="relative flex h-16 w-16 shrink-0 items-center justify-center">
          {!done && !failed && (
            <>
              <span
                className="absolute inset-0 animate-ping rounded-full border-2 border-primary/20"
                aria-hidden
              />
              <span
                className="absolute inset-1 animate-spin rounded-full border-2 border-primary/30"
                style={{ animationDuration: "3s" }}
                aria-hidden
              />
            </>
          )}
          <div
            className={cn(
              "relative flex h-11 w-11 items-center justify-center rounded-full",
              failed ? "bg-destructive/10" : "bg-primary/10",
            )}
          >
            {done ? (
              <CheckCircle2 className="h-6 w-6 text-[hsl(var(--success))]" />
            ) : failed ? (
              <XCircle className="h-6 w-6 text-destructive" />
            ) : (
              <Icon className="h-5 w-5 text-primary" />
            )}
          </div>
        </div>

        <div className="w-full min-w-0 space-y-1">
          <p
            className="truncate font-display text-base font-semibold"
            title={done ? doneTitle : failed ? failedTitle : current?.label}
          >
            {done ? doneTitle : failed ? failedTitle : current?.label}
          </p>
          {failed && errorMessage ? (
            <p
              className="truncate text-sm text-destructive"
              title={errorMessage}
            >
              {errorMessage}
            </p>
          ) : !finished && detail ? (
            <p
              className="truncate text-sm text-muted-foreground"
              title={detail}
            >
              {detail}
            </p>
          ) : null}
        </div>
      </div>

      <div className="min-w-0 space-y-2">
        <div className="flex min-w-0 items-center justify-between gap-2 text-xs text-muted-foreground">
          <span className="shrink-0">Progress</span>
          <span className="shrink-0 tabular-nums font-medium text-foreground">
            {progress}%
          </span>
        </div>
        <ProgressBar value={progress} />
      </div>

      {done && summaryLines?.length ? (
        <ul className="space-y-1 rounded-lg border border-border/80 bg-muted/20 p-3 text-sm text-muted-foreground">
          {summaryLines.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
      ) : null}

      <ol className="space-y-2 rounded-lg border border-border/80 bg-muted/20 p-4">
        {steps.map((step, index) => {
          const isComplete =
            done || step.status === "done" || index < activeStepIndex;
          const isCurrent = !finished && !failed && index === activeStepIndex;

          return (
            <li
              key={step.id}
              className={cn(
                "flex min-w-0 items-center gap-3 text-sm transition-colors",
                isComplete && "text-muted-foreground",
                isCurrent && "font-medium text-foreground",
                !isComplete && !isCurrent && "text-muted-foreground/45",
              )}
            >
              {isComplete ? (
                <CheckCircle2
                  className="h-4 w-4 shrink-0 text-[hsl(var(--success))]"
                  aria-hidden
                />
              ) : isCurrent ? (
                <Loader2
                  className="h-4 w-4 shrink-0 animate-spin text-primary"
                  aria-hidden
                />
              ) : (
                <Circle
                  className="h-4 w-4 shrink-0 text-muted-foreground/35"
                  aria-hidden
                />
              )}
              <span className="min-w-0 truncate">{step.label}</span>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
