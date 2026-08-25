"use client";

import * as React from "react";

import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Field } from "@/components/ui/field";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import type { Matcher } from "react-day-picker";

type DatePickerProps = {
  value?: Date;
  onChange?: (date: Date | undefined) => void;
  disabled?: Matcher | Matcher[];
  startMonth?: Date;
  endMonth?: Date;
};

export function DatePicker({
  value,
  onChange,
  disabled,
  startMonth,
  endMonth,
}: DatePickerProps) {
  const [open, setOpen] = React.useState(false);
  const [internalDate, setInternalDate] = React.useState<Date | undefined>(
    value,
  );

  // Sync when controlled value changes
  React.useEffect(() => {
    if (value !== undefined) setInternalDate(value);
  }, [value]);

  const displayDate = value !== undefined ? value : internalDate;

  return (
    <Field className="w-full">
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            id="date"
            className="justify-start font-normal"
          >
            {displayDate ? displayDate.toLocaleDateString() : "Select date"}
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
            onSelect={(date) => {
              setInternalDate(date);
              onChange?.(date);
              setOpen(false);
            }}
          />
        </PopoverContent>
      </Popover>
    </Field>
  );
}
