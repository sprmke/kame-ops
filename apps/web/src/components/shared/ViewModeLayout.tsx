import type { ReactNode } from "react";

import type { ViewMode } from "@/components/shared/ViewToggle";

type ViewModeLayoutProps = {
  viewMode: ViewMode;
  table: ReactNode;
  grid: ReactNode;
};

/** On viewports below `md`, always shows `grid` and hides `table`. */
export function ViewModeLayout({ viewMode, table, grid }: ViewModeLayoutProps) {
  if (viewMode === "table") {
    return (
      <>
        <div className="hidden md:block">{table}</div>
        <div className="md:hidden">{grid}</div>
      </>
    );
  }

  return grid;
}
