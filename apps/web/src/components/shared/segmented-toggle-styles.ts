import { cn } from "@/lib/utils/cn";

export const segmentedToggleRootClass = cn(
  "inline-flex max-w-full items-center overflow-x-auto rounded-lg border bg-muted p-1",
);

export const segmentedToggleButtonClass = (isActive: boolean) =>
  cn(
    "inline-flex min-h-11 shrink-0 items-center justify-center rounded-md px-2.5 text-sm font-medium transition-all duration-200 sm:px-3",
    isActive
      ? "bg-background text-foreground shadow-sm"
      : "text-muted-foreground hover:text-foreground",
  );

export const segmentedToggleIconClass = "h-4 w-4 shrink-0 sm:mr-2";

export const segmentedToggleLabelClass = "hidden sm:inline";
