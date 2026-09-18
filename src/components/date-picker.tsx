"use client";

import { useMemo, useState } from "react";
import { CalendarIcon, X } from "lucide-react";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

// Minimum and maximum selectable birth dates.
export const DOB_MIN_DATE = new Date(1900, 0, 1); // 01/01/1900
export const DOB_MAX_DATE = (() => {
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate());
})(); // today

interface DatePickerProps {
  value: string; // ISO yyyy-mm-dd or ""
  onChange: (value: string) => void;
  id?: string;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  /** Locale for the calendar and the displayed date. */
  locale?: string;
}

function parseISODate(iso: string): Date | undefined {
  if (!iso) return undefined;
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!match) return undefined;
  const date = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  return Number.isNaN(date.getTime()) ? undefined : date;
}

function toISODate(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/**
 * Custom date picker popup: a button + popover calendar.
 * Constrains the selection between 01/01/1900 and today, so
 * unreasonable dates (year 0099, 1234, 3422…) are impossible.
 */
export function DatePicker({
  value,
  onChange,
  id,
  placeholder = "JJ/MM/AAAA",
  disabled,
  className,
  locale = "fr-FR",
}: DatePickerProps) {
  const [open, setOpen] = useState(false);
  const [month, setMonth] = useState<Date>(() => parseISODate(value) ?? DOB_MAX_DATE);

  const selected = useMemo(() => parseISODate(value), [value]);

  // Follow the value when it changes from outside (initial load, reset…),
  // using the render-time adjustment pattern. The user's own navigation
  // (dropdown / arrows) is never overridden.
  const [prevValue, setPrevValue] = useState(value);
  if (value !== prevValue) {
    setPrevValue(value);
    const parsed = parseISODate(value);
    if (parsed) setMonth(parsed);
  }

  const handleSelect = (date: Date | undefined) => {
    if (!date) return;
    onChange(toISODate(date));
    setOpen(false);
  };

  const displayLabel = selected
    ? selected.toLocaleDateString(locale, {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
      })
    : placeholder;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          id={id}
          type="button"
          variant="outline"
          disabled={disabled}
          className={cn(
            "w-full justify-start font-normal",
            !selected && "text-muted-foreground",
            className
          )}
        >
          <CalendarIcon className="mr-2 h-4 w-4 shrink-0 text-muted-foreground" />
          <span className={cn(selected && "num")}>{displayLabel}</span>
          {selected && !disabled && (
            <span
              role="button"
              tabIndex={0}
              aria-label="Effacer la date"
              className="ml-auto rounded-sm p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground"
              onClick={(e) => {
                e.stopPropagation();
                onChange("");
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  e.stopPropagation();
                  onChange("");
                }
              }}
            >
              <X className="h-3.5 w-3.5" />
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        <Calendar
          mode="single"
          selected={selected}
          month={month}
          onMonthChange={setMonth}
          onSelect={handleSelect}
          disabled={[
            { before: DOB_MIN_DATE },
            { after: DOB_MAX_DATE },
          ]}
          fromYear={1900}
          toYear={DOB_MAX_DATE.getFullYear()}
          captionLayout="dropdown"
          defaultMonth={selected ?? DOB_MAX_DATE}
        />
      </PopoverContent>
    </Popover>
  );
}
