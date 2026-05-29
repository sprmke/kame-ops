'use client';

import { useEffect, useState, useRef } from 'react';
import { format } from 'date-fns';
import {
  Calendar,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  CalendarDays,
} from 'lucide-react';
import { DateRange as DayPickerDateRange } from 'react-day-picker';

import { Button } from '@/components/ui/button';
import { Calendar as CalendarComponent } from '@/components/ui/calendar';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

import {
  type DateNavigationState,
  type DatePreset,
  formatDateRangeDisplay,
  isCurrentPeriod,
} from '@/lib/utils/date-navigation';

interface DateRangeSelectorProps extends DateNavigationState {}

export function DateRangeSelector({
  dateRange,
  datePreset,
  setDatePreset,
  setDateRange,
  navigatePeriod,
  goToToday,
}: DateRangeSelectorProps) {
  const [isCalendarOpen, setIsCalendarOpen] = useState(false);
  const [pendingCalendarOpen, setPendingCalendarOpen] = useState(false);
  const calendarRef = useRef<HTMLDivElement>(null);

  const [localRange, setLocalRange] = useState<
    DayPickerDateRange | undefined
  >(undefined);

  const isCurrent = isCurrentPeriod(dateRange.from, datePreset);
  const canNavigate = datePreset !== 'custom';
  const isCustomMode = datePreset === 'custom';

  // Reset local state when calendar opens
  useEffect(() => {
    if (isCalendarOpen) {
      setLocalRange(undefined);
    }
  }, [isCalendarOpen]);

  // Effect to open calendar after switching to custom mode
  useEffect(() => {
    if (!pendingCalendarOpen || !isCustomMode) return;

    const timer = setTimeout(() => {
      setIsCalendarOpen(true);
      setPendingCalendarOpen(false);
    }, 150);
    return () => clearTimeout(timer);
  }, [pendingCalendarOpen, isCustomMode]);

  // Handle click outside to close
  useEffect(() => {
    if (!isCalendarOpen) return;

    const handleClickOutside = (event: MouseEvent) => {
      if (
        calendarRef.current &&
        !calendarRef.current.contains(event.target as Node)
      ) {
        setIsCalendarOpen(false);
      }
    };

    const timer = setTimeout(() => {
      document.addEventListener('mousedown', handleClickOutside);
    }, 100);

    return () => {
      clearTimeout(timer);
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isCalendarOpen]);

  const handleDateSelect = (range: DayPickerDateRange | undefined) => {
    setLocalRange(range);
  };

  const handleApplyRange = () => {
    if (localRange?.from && localRange?.to) {
      setDateRange({ from: localRange.from, to: localRange.to });
      setIsCalendarOpen(false);
    }
  };

  const handlePresetChange = (value: string) => {
    if (value === 'custom') {
      setDatePreset('custom');
      setPendingCalendarOpen(true);
    } else {
      setDatePreset(value as DatePreset);
    }
  };

  return (
    <div className="flex items-center gap-1">
      {/* Previous Period Button */}
      {canNavigate && (
        <Button
          variant="ghost"
          size="icon"
          className="h-9 w-9"
          onClick={() => navigatePeriod('prev')}
          aria-label="Previous period"
        >
          <ChevronLeft className="h-4 w-4" />
        </Button>
      )}

      {/* Custom mode: Calendar panel */}
      {isCustomMode ? (
        <div className="relative">
          <Button
            variant="outline"
            className="min-w-[240px] justify-between gap-2 font-medium"
            onClick={() => setIsCalendarOpen(!isCalendarOpen)}
          >
            <div className="flex items-center gap-2">
              <CalendarDays className="h-4 w-4 text-muted-foreground" />
              <span>
                {formatDateRangeDisplay(
                  dateRange.from,
                  dateRange.to,
                  datePreset
                )}
              </span>
            </div>
            <ChevronDown className="h-4 w-4 opacity-50" />
          </Button>

          {isCalendarOpen && (
            <div
              ref={calendarRef}
              className="absolute right-0 top-full z-50 mt-2 rounded-md border bg-popover shadow-md"
            >
              <div className="border-b p-3">
                <div className="flex items-center justify-between gap-4">
                  <span className="text-sm font-medium">
                    Select date range
                  </span>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-7 text-xs"
                    onClick={() => {
                      setDatePreset('month');
                      setIsCalendarOpen(false);
                    }}
                  >
                    Back to presets
                  </Button>
                </div>
              </div>
              <CalendarComponent
                mode="range"
                defaultMonth={dateRange.from}
                selected={localRange}
                onSelect={handleDateSelect}
                numberOfMonths={2}
              />
              <div className="flex items-center justify-between border-t p-3">
                <div className="text-sm text-muted-foreground">
                  {localRange?.from ? (
                    <>
                      {format(localRange.from, 'MMM d, yyyy')}
                      {localRange.to ? (
                        <>
                          {' '}
                          — {format(localRange.to, 'MMM d, yyyy')}
                        </>
                      ) : (
                        <span className="text-muted-foreground/60">
                          {' '}
                          → select end date
                        </span>
                      )}
                    </>
                  ) : (
                    <span className="text-muted-foreground/60">
                      Select start date
                    </span>
                  )}
                </div>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setIsCalendarOpen(false)}
                  >
                    Cancel
                  </Button>
                  <Button
                    size="sm"
                    onClick={handleApplyRange}
                    disabled={!localRange?.from || !localRange?.to}
                  >
                    Apply
                  </Button>
                </div>
              </div>
            </div>
          )}
        </div>
      ) : (
        /* Non-custom mode: Dropdown menu */
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="outline"
              className="min-w-[180px] justify-between gap-2 font-medium"
            >
              <div className="flex items-center gap-2">
                <Calendar className="h-4 w-4 text-muted-foreground" />
                <span>
                  {formatDateRangeDisplay(
                    dateRange.from,
                    dateRange.to,
                    datePreset
                  )}
                </span>
              </div>
              <ChevronDown className="h-4 w-4 opacity-50" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-52">
            <DropdownMenuLabel className="flex items-center justify-between">
              <span>View by</span>
              {!isCurrent && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-6 px-2 text-xs"
                  onClick={goToToday}
                >
                  Today
                </Button>
              )}
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuRadioGroup
              value={datePreset}
              onValueChange={handlePresetChange}
            >
              <DropdownMenuRadioItem value="week" className="gap-2">
                <CalendarDays className="h-4 w-4" />
                Week
              </DropdownMenuRadioItem>
              <DropdownMenuRadioItem value="month" className="gap-2">
                <Calendar className="h-4 w-4" />
                Month
              </DropdownMenuRadioItem>
              <DropdownMenuRadioItem value="year" className="gap-2">
                <Calendar className="h-4 w-4" />
                Year
              </DropdownMenuRadioItem>
              <DropdownMenuSeparator />
              <DropdownMenuRadioItem value="custom" className="gap-2">
                <CalendarDays className="h-4 w-4" />
                Custom Range
              </DropdownMenuRadioItem>
            </DropdownMenuRadioGroup>
          </DropdownMenuContent>
        </DropdownMenu>
      )}

      {/* Next Period Button */}
      {canNavigate && (
        <Button
          variant="ghost"
          size="icon"
          className="h-9 w-9"
          onClick={() => navigatePeriod('next')}
          aria-label="Next period"
        >
          <ChevronRight className="h-4 w-4" />
        </Button>
      )}

      {/* Today Button (for custom mode) */}
      {isCustomMode && (
        <Button
          variant="ghost"
          size="sm"
          className="h-9 px-3"
          onClick={() => setDatePreset('month')}
        >
          Reset
        </Button>
      )}
    </div>
  );
}
