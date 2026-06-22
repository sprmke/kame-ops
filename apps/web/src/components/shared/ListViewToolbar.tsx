"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";

import { ViewToggle, type ViewMode } from "@/components/shared/ViewToggle";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils/cn";

type ListViewToolbarProps = {
  total: number;
  itemLabel: string;
  page: number;
  pageCount: number;
  rangeStart: number;
  rangeEnd: number;
  hasMultiplePages: boolean;
  onPageChange: (page: number) => void;
  viewMode: ViewMode;
  onViewModeChange: (mode: ViewMode) => void;
  className?: string;
};

export function ListViewToolbar({
  total,
  itemLabel,
  page,
  pageCount,
  rangeStart,
  rangeEnd,
  hasMultiplePages,
  onPageChange,
  viewMode,
  onViewModeChange,
  className,
}: ListViewToolbarProps) {
  const label = total === 1 ? itemLabel.replace(/s$/, "") : itemLabel;

  return (
    <div
      className={cn(
        "flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between",
        className,
      )}
    >
      <div className="flex flex-wrap items-center gap-3">
        <p className="text-sm text-muted-foreground">
          <span className="font-medium text-foreground tabular-nums">
            {total}
          </span>{" "}
          {label}
        </p>
        {hasMultiplePages && (
          <>
            <span className="hidden text-muted-foreground sm:inline">·</span>
            <p className="text-sm text-muted-foreground tabular-nums">
              {rangeStart}–{rangeEnd} of {total}
            </p>
            <div className="flex items-center gap-1">
              <Button
                type="button"
                variant="outline"
                size="icon"
                className="h-8 w-8"
                disabled={page <= 1}
                onClick={() => onPageChange(page - 1)}
                aria-label="Previous page"
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <span className="min-w-[4.5rem] text-center text-sm text-muted-foreground tabular-nums">
                {page} / {pageCount}
              </span>
              <Button
                type="button"
                variant="outline"
                size="icon"
                className="h-8 w-8"
                disabled={page >= pageCount}
                onClick={() => onPageChange(page + 1)}
                aria-label="Next page"
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </>
        )}
      </div>
      <ViewToggle
        value={viewMode}
        onChange={onViewModeChange}
        options={["table", "grid"]}
      />
    </div>
  );
}
