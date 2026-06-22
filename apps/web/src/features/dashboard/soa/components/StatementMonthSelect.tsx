"use client";

import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

import { STATEMENT_MONTHS } from "../lib/soa-utils";

type StatementMonthSelectProps = {
  id?: string;
  label?: string;
  value: number;
  onChange: (month: number) => void;
};

export function StatementMonthSelect({
  id,
  label = "Month",
  value,
  onChange,
}: StatementMonthSelectProps) {
  return (
    <div className="space-y-2">
      <Label htmlFor={id}>{label}</Label>
      <Select value={String(value)} onValueChange={(v) => onChange(Number(v))}>
        <SelectTrigger id={id}>
          <SelectValue placeholder="Select month" />
        </SelectTrigger>
        <SelectContent>
          {STATEMENT_MONTHS.map((m) => (
            <SelectItem key={m.value} value={String(m.value)}>
              {m.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
