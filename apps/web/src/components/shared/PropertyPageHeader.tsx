"use client";

import type { ReactNode } from "react";

import type { DateNavigationState } from "@/lib/utils/date-navigation";

import { DateRangeSelector } from "./DateRangeSelector";

interface PropertyPageHeaderProps {
  title: string;
  subtitle: string;
  /** Date navigation state – pass from useDateNavigation() or a Zustand store */
  dateNavigation?: DateNavigationState;
  /** Action buttons rendered after the date navigation (e.g. "New Booking") */
  actions?: ReactNode;
}

export function PropertyPageHeader({
  title,
  subtitle,
  dateNavigation,
  actions,
}: PropertyPageHeaderProps) {
  return (
    <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
      <div>
        <h1 className="font-display text-2xl font-bold tracking-tight text-foreground md:text-3xl">
          {title}
        </h1>
        <p className="text-muted-foreground">{subtitle}</p>
      </div>
      {(dateNavigation || actions) && (
        <div className="flex items-center gap-3">
          {dateNavigation && <DateRangeSelector {...dateNavigation} />}
          {actions}
        </div>
      )}
    </div>
  );
}
