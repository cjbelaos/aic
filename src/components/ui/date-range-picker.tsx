"use client";

import * as React from "react";
import { CalendarRange, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import type { DateRange } from "react-day-picker";

type DateRangeValue = { from?: Date; to?: Date };

type DateRangePickerProps = {
  value?: DateRangeValue;
  onChange?: (range: DateRangeValue | undefined) => void;
};

export function DateRangePicker({ value, onChange }: DateRangePickerProps) {
  const [open, setOpen] = React.useState(false);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          className={cn(
            "h-9 w-[280px] justify-start text-left font-normal",
            !value?.from && "text-muted-foreground",
          )}
        >
          <CalendarRange className="mr-2 h-4 w-4" />
          {value?.from ? (
            value.to ? (
              <>
                {format(value.from, "MMM d, yyyy")} —{" "}
                {format(value.to, "MMM d, yyyy")}
              </>
            ) : (
              format(value.from, "MMM d, yyyy")
            )
          ) : (
            "Date range"
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto overflow-hidden p-0" align="end">
        <Calendar
          mode="range"
          selected={value as DateRange}
          defaultMonth={value?.from}
          captionLayout="dropdown"
          numberOfMonths={2}
          onSelect={(range) => {
            onChange?.(range);
            if (range?.from && range?.to) setOpen(false);
          }}
        />
        {value?.from && (
          <div className="flex items-center justify-between border-t p-3">
            <Button
              variant="ghost"
              size="sm"
              className="h-8 text-muted-foreground"
              onClick={() => onChange?.(undefined)}
            >
              <X className="mr-1 h-3.5 w-3.5" /> Clear
            </Button>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}
