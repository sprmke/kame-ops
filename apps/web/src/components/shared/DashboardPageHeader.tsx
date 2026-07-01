import { type ReactNode } from 'react';

import { cn } from '@/lib/utils/cn';

interface DashboardPageHeaderProps {
  title: string;
  description?: string;
  actions?: ReactNode;
  className?: string;
}

export function DashboardPageHeader({
  title,
  description,
  actions,
  className,
}: DashboardPageHeaderProps) {
  return (
    <div
      className={cn(
        'flex relative flex-col gap-4 sm:flex-row sm:items-end sm:justify-between',
        className,
      )}
    >
      <div className="pl-4 space-y-2 border-l-4 border-primary">
        <h1 className="text-2xl font-bold tracking-tight break-words font-display text-foreground sm:text-3xl">
          {title}
        </h1>
        {description && (
          <p className="max-w-2xl text-sm text-muted-foreground">
            {description}
          </p>
        )}
      </div>
      {actions && (
        <div className="flex flex-wrap gap-2 pl-4 shrink-0 sm:pl-0">
          {actions}
        </div>
      )}
    </div>
  );
}
