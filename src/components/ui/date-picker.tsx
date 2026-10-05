"use client";

import * as React from "react";
import { format, isValid, parse } from "date-fns";
import { CalendarIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import type { Matcher } from "react-day-picker";

type DatePickerProps = Omit<
  React.ComponentProps<typeof Button>,
  "value" | "onChange" | "disabled"
> & {
  value?: Date;
  onChange?: (date: Date | undefined) => void;
  disabled?: boolean | Matcher | Matcher[];
  startMonth?: Date;
  endMonth?: Date;
  placeholder?: string;
  required?: boolean;
  displayFormat?: string;
};

export function DatePicker({
  value,
  onChange,
  disabled,
  startMonth,
  endMonth,
  placeholder = "Select date",
  required,
  displayFormat = "MMM d, yyyy",
  className,
  ...props
}: DatePickerProps) {
  const [open, setOpen] = React.useState(false);
  const [internalDate, setInternalDate] = React.useState<Date>();
  const displayDate = onChange ? value : (value ?? internalDate);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          {...props}
          type="button"
          variant="outline"
          disabled={disabled === true}
          aria-required={required}
          className={cn(
            "h-9 w-full justify-start font-normal",
            !displayDate && "text-muted-foreground",
            className,
          )}
        >
          <CalendarIcon className="mr-2 size-4" />
          {displayDate ? format(displayDate, displayFormat) : placeholder}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto overflow-hidden p-0" align="start">
        <Calendar
          mode="single"
          selected={displayDate}
          defaultMonth={displayDate}
          captionLayout="dropdown"
          disabled={disabled}
          startMonth={startMonth}
          endMonth={endMonth}
          required={required}
          onSelect={(date: Date | undefined) => {
            setInternalDate(date);
            onChange?.(date);
            setOpen(false);
          }}
        />
        {!required && displayDate && (
          <div className="border-t p-2">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => {
                setInternalDate(undefined);
                onChange?.(undefined);
                setOpen(false);
              }}
            >
              Clear date
            </Button>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}

export function parseDateValue(value?: string): Date | undefined {
  if (!value) return undefined;
  const date = parse(value, "yyyy-MM-dd", new Date());
  return isValid(date) && format(date, "yyyy-MM-dd") === value
    ? date
    : undefined;
}

type DatePickerInputProps = Omit<
  DatePickerProps,
  "value" | "onChange" | "disabled"
> & {
  value?: string;
  onChange?: (value: string) => void;
  disabled?: boolean;
  min?: string;
  max?: string;
};

/** Keeps form values as local YYYY-MM-DD strings, without UTC conversion. */
export function DatePickerInput({
  value,
  onChange,
  min,
  max,
  disabled,
  name,
  ...props
}: DatePickerInputProps) {
  const minimum = parseDateValue(min);
  const maximum = parseDateValue(max);
  const limits: Matcher[] = [];
  if (minimum) limits.push({ before: minimum });
  if (maximum) limits.push({ after: maximum });
  return (
    <>
      {name && (
        <input
          type="hidden"
          name={name}
          value={value ?? ""}
          disabled={disabled}
        />
      )}
      <DatePicker
        {...props}
        value={parseDateValue(value)}
        disabled={disabled || limits}
        onChange={(date) => onChange?.(date ? format(date, "yyyy-MM-dd") : "")}
      />
    </>
  );
}

export function MonthPickerInput({
  value,
  onChange,
  ...props
}: Omit<DatePickerInputProps, "min" | "max">) {
  return (
    <DatePickerInput
      {...props}
      placeholder="Select month"
      displayFormat="MMM yyyy"
      value={value ? `${value}-01` : ""}
      onChange={(date) => onChange?.(date.slice(0, 7))}
    />
  );
}
