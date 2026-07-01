'use client';

import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  segmentedToggleButtonClass,
  segmentedToggleRootClass,
} from '@/components/shared/segmented-toggle-styles';
import {
  AUTOMATION_FREQUENCIES,
  formatTimeInput,
  parseTimeInput,
  WEEKDAY_OPTIONS,
  type AutomationFrequency,
  type AutomationScheduleInput,
} from '@/lib/automations/schedule';

const FREQUENCY_LABELS: Record<AutomationFrequency, string> = {
  daily: 'Daily',
  weekly: 'Weekly',
  monthly: 'Monthly',
};

type AutomationScheduleFieldsProps = {
  value: AutomationScheduleInput;
  onChange: (value: AutomationScheduleInput) => void;
  /** Hide frequency options — used for payment reminders (daily-only). */
  dailyOnly?: boolean;
  dailyOnlyNote?: string;
};

export function AutomationScheduleFields({
  value,
  onChange,
  dailyOnly = false,
  dailyOnlyNote,
}: AutomationScheduleFieldsProps) {
  return (
    <div className="space-y-4">
      {!dailyOnly && (
        <div className="inline-flex flex-col space-y-2">
          <Label>How often</Label>
          <div className={segmentedToggleRootClass}>
            {AUTOMATION_FREQUENCIES.map((frequency) => (
              <button
                key={frequency}
                type="button"
                className={segmentedToggleButtonClass(
                  value.frequency === frequency,
                )}
                onClick={() => onChange({ ...value, frequency })}
              >
                {FREQUENCY_LABELS[frequency]}
              </button>
            ))}
          </div>
        </div>
      )}

      {!dailyOnly && value.frequency === 'weekly' && (
        <div className="space-y-2">
          <Label>Day</Label>
          <Select
            value={String(value.dayOfWeek ?? 1)}
            onValueChange={(day) =>
              onChange({ ...value, dayOfWeek: Number(day) })
            }
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {WEEKDAY_OPTIONS.map((option) => (
                <SelectItem key={option.value} value={String(option.value)}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      {!dailyOnly && value.frequency === 'monthly' && (
        <div className="space-y-2">
          <Label>Day of month</Label>
          <Select
            value={String(value.dayOfMonth ?? 1)}
            onValueChange={(day) =>
              onChange({ ...value, dayOfMonth: Number(day) })
            }
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {Array.from({ length: 28 }, (_, index) => index + 1).map(
                (day) => (
                  <SelectItem key={day} value={String(day)}>
                    {day}
                  </SelectItem>
                ),
              )}
            </SelectContent>
          </Select>
        </div>
      )}

      <div className="space-y-2">
        <Label>Time</Label>
        <Input
          type="time"
          value={formatTimeInput(value.hour, value.minute)}
          onChange={(event) => {
            const { hour, minute } = parseTimeInput(event.target.value);
            onChange({ ...value, hour, minute });
          }}
        />
        {dailyOnly && dailyOnlyNote ? (
          <p className="text-xs text-muted-foreground">{dailyOnlyNote}</p>
        ) : null}
      </div>
    </div>
  );
}
