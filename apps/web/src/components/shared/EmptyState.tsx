import { type ReactNode } from "react";
import { InboxIcon } from "lucide-react";

import { cn } from "@/lib/utils/cn";

interface EmptyStateProps {
  icon?: ReactNode;
  title?: string;
  message: string;
  action?: ReactNode;
  className?: string;
}

export function EmptyState({
  icon,
  title,
  message,
  action,
  className,
}: EmptyStateProps) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center rounded-xl border border-dashed border-border bg-muted/20 py-12 text-center",
        className,
      )}
    >
      <div className="mb-4 rounded-full bg-gradient-to-br from-primary/15 to-[hsl(var(--chart-2)/0.1)] p-4 ring-1 ring-primary/15">
        {icon ?? <InboxIcon className="h-6 w-6 text-primary" aria-hidden />}
      </div>
      {title && (
        <h3 className="font-display mb-2 text-lg font-semibold">{title}</h3>
      )}
      <p className="mb-4 max-w-sm text-sm text-muted-foreground">{message}</p>
      {action}
    </div>
  );
}
