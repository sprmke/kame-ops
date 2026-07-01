import type { ReactNode } from "react";

import { cn } from "@/lib/utils/cn";

type DashboardSectionProps = {
  title: string;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
};

export function DashboardSection({
  title,
  action,
  children,
  className,
}: DashboardSectionProps) {
  return (
    <section className={cn("space-y-4", className)}>
      <div className="flex items-center justify-between gap-4">
        <h2 className="border-l-2 border-primary pl-3 font-display text-base font-semibold tracking-tight text-foreground">
          {title}
        </h2>
        {action}
      </div>
      {children}
    </section>
  );
}
