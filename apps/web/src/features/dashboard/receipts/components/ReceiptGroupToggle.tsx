"use client";

import { CalendarDays, CreditCard, type LucideIcon } from "lucide-react";

import {
  segmentedToggleButtonClass,
  segmentedToggleIconClass,
  segmentedToggleLabelClass,
  segmentedToggleRootClass,
} from "@/components/shared/segmented-toggle-styles";
import { cn } from "@/lib/utils/cn";

import type { ReceiptGroupMode } from "../lib/receipt-utils";

const OPTIONS: {
  value: ReceiptGroupMode;
  label: string;
  icon: LucideIcon;
}[] = [
  { value: "month", label: "Month", icon: CalendarDays },
  { value: "card", label: "Card", icon: CreditCard },
];

type ReceiptGroupToggleProps = {
  value: ReceiptGroupMode;
  onChange: (value: ReceiptGroupMode) => void;
  className?: string;
};

export function ReceiptGroupToggle({
  value,
  onChange,
  className,
}: ReceiptGroupToggleProps) {
  return (
    <div className={cn(segmentedToggleRootClass, className)}>
      {OPTIONS.map((option) => {
        const Icon = option.icon;
        const isActive = value === option.value;

        return (
          <button
            key={option.value}
            type="button"
            onClick={() => onChange(option.value)}
            className={segmentedToggleButtonClass(isActive)}
            aria-label={`Group by ${option.label.toLowerCase()}`}
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
