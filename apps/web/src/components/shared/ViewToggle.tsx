"use client";

import * as React from "react";
import { LayoutGrid, List, Kanban } from "lucide-react";

import { cn } from "@/lib/utils/cn";

export type ViewMode = "grid" | "table" | "kanban";

interface ViewOption {
  value: ViewMode;
  label: string;
  icon: typeof LayoutGrid;
}

const VIEW_OPTIONS: ViewOption[] = [
  { value: "table", label: "Table", icon: List },
  { value: "grid", label: "Cards", icon: LayoutGrid },
  { value: "kanban", label: "Kanban", icon: Kanban },
];

interface ViewToggleProps {
  value: ViewMode;
  onChange: (value: ViewMode) => void;
  className?: string;
  options?: ViewMode[];
}

export function ViewToggle({
  value,
  onChange,
  className,
  options = ["table", "grid", "kanban"],
}: ViewToggleProps) {
  const filteredOptions = options
    .map((value) => VIEW_OPTIONS.find((opt) => opt.value === value))
    .filter((opt): opt is ViewOption => opt != null);

  return (
    <div
      className={cn(
        "inline-flex items-center rounded-lg border bg-muted p-1",
        className,
      )}
    >
      {filteredOptions.map((option) => {
        const Icon = option.icon;
        const isActive = value === option.value;

        return (
          <button
            key={option.value}
            type="button"
            onClick={() => onChange(option.value)}
            className={cn(
              "inline-flex items-center justify-center rounded-md px-3 py-1.5 text-sm font-medium transition-all duration-200",
              isActive
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground",
            )}
            aria-label={`${option.label} view`}
            aria-pressed={isActive}
          >
            <Icon className="mr-2 h-4 w-4" />
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
