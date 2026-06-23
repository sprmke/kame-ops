"use client";

import { CheckCircle2, Circle, FileText, Loader2, XCircle } from "lucide-react";

import { cn } from "@/lib/utils/cn";

import type { RunSoaProgressStep } from "../lib/run-soa-progress";

type RunSoaProgressPanelProps = {
  steps: RunSoaProgressStep[];
  activeStepIndex: number;
  progress: number;
  finished?: boolean;
  failed?: boolean;
  errorMessage?: string | null;
  pastEstimate?: boolean;
};

function RunProgressBar({ value }: { value: number }) {
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

export function RunSoaProgressPanel({
  steps,
  activeStepIndex,
  progress,
  finished = false,
  failed = false,
  errorMessage,
  pastEstimate = false,
}: RunSoaProgressPanelProps) {
  const current = steps[activeStepIndex] ?? steps[0];
  const done = finished && !failed;

  return (
    <div className="space-y-6 py-2" aria-live="polite" aria-busy={!finished}>
      <div className="flex flex-col items-center gap-4 pt-2 text-center">
        <div className="relative flex h-16 w-16 items-center justify-center">
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
              <FileText className="h-5 w-5 text-primary" />
            )}
          </div>
        </div>

        <div className="space-y-1">
          <p className="font-display text-base font-semibold">
            {done ? "All done" : failed ? "Run failed" : current?.label}
          </p>
          {failed && errorMessage ? (
            <p className="text-sm text-destructive">{errorMessage}</p>
          ) : !finished ? (
            <p className="text-sm text-muted-foreground">
              {pastEstimate
                ? "Still working — calendar sync and uploads can take a bit longer."
                : "This usually takes 1–2 minutes. Please wait for the run to complete."}
            </p>
          ) : null}
        </div>
      </div>

      <div className="space-y-2">
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>Progress</span>
          <span className="tabular-nums font-medium text-foreground">
            {progress}%
          </span>
        </div>
        <RunProgressBar value={progress} />
      </div>

      <ol className="space-y-2 rounded-lg border border-border/80 bg-muted/20 p-4">
        {steps.map((step, index) => {
          const isComplete = done || index < activeStepIndex;
          const isCurrent = !finished && index === activeStepIndex;

          return (
            <li
              key={step.id}
              className={cn(
                "flex items-center gap-3 text-sm transition-colors",
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
              <span>{step.label}</span>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
