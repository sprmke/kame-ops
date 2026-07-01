"use client";

import * as React from "react";
import { LayoutGrid, List, Kanban } from "lucide-react";

import {
  segmentedToggleButtonClass,
  segmentedToggleIconClass,
  segmentedToggleLabelClass,
  segmentedToggleRootClass,
} from "@/components/shared/segmented-toggle-styles";
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
    .map((optionValue) => VIEW_OPTIONS.find((opt) => opt.value === optionValue))
    .filter((opt): opt is ViewOption => opt != null);

  return (
    <div
      className={cn(
        segmentedToggleRootClass,
        "hidden md:inline-flex",
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
            className={segmentedToggleButtonClass(isActive)}
            aria-label={`${option.label} view`}
            aria-pressed={isActive}
          >
            <Icon className={segmentedToggleIconClass} />
            <span className={segmentedToggleLabelClass}>{option.label}</span>
          </button>
        );
      })}
    </div>
  );
}
