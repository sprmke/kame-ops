"use client";

import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils/cn";

type CardColorPickerProps = {
  value: string;
  onChange: (value: string) => void;
  className?: string;
};

export function CardColorPicker({
  value,
  onChange,
  className,
}: CardColorPickerProps) {
  const normalized = value.startsWith("#") ? value : `#${value}`;

  return (
    <div className={cn("flex items-center gap-3", className)}>
      <label className="relative shrink-0 cursor-pointer">
        <span
          className="block h-10 w-10 rounded-lg border border-border shadow-sm"
          style={{ backgroundColor: normalized }}
        />
        <input
          type="color"
          value={normalized}
          onChange={(e) => onChange(e.target.value.toUpperCase())}
          className="absolute inset-0 h-full w-full cursor-pointer opacity-0"
          aria-label="Pick card color"
        />
      </label>
      <Input
        value={normalized}
        onChange={(e) => {
          const next = e.target.value.trim();
          if (/^#[0-9A-Fa-f]{0,6}$/.test(next) || next === "") {
            onChange(next.toUpperCase());
          }
        }}
        maxLength={7}
        className="font-mono uppercase"
        spellCheck={false}
      />
    </div>
  );
}
