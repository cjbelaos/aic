"use client";

import * as React from "react";
import { Check, ChevronsUpDown, Plus } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "./select";
import { optionText, type SelectOption } from "./select-options";

type Option = SelectOption;

type SearchableSelectProps = {
  value?: string;
  onValueChange: (value: string) => void;
  options: Option[];
  placeholder?: string;
  searchPlaceholder?: string;
  emptyText?: string;
  disabled?: boolean;
  className?: string;
  contentClassName?: string;
  onAddOption?: (searchText: string) => void;
  addOptionLabel?: string;
  triggerProps?: React.ComponentProps<"button">;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  name?: string;
  required?: boolean;
};

export function SearchableSelect({
  value,
  onValueChange,
  options,
  placeholder = "Select...",
  searchPlaceholder = "Search...",
  emptyText = "No results found.",
  disabled,
  className,
  contentClassName,
  onAddOption,
  addOptionLabel = "+ Add",
  triggerProps, open: controlledOpen, onOpenChange, name, required,
}: SearchableSelectProps) {
  const [internalOpen, setInternalOpen] = React.useState(false);
  const open = controlledOpen ?? internalOpen;
  const setOpen = (next: boolean) => { setInternalOpen(next); onOpenChange?.(next); };
  const [search, setSearch] = React.useState("");
  const selected = options.find((o) => o.value === value);

  const handleOpenChange = (next: boolean) => {
    setOpen(next);
    if (next) setSearch("");
  };

  const query = search.trim().toLowerCase();
  const filteredOptions = query
    ? options.filter(
        (o) =>
          optionText(o.label).toLowerCase().includes(query) ||
          o.value.toLowerCase().includes(query),
      )
    : options;

  const showAddOption = !!onAddOption && query !== "";

  if (options.length <= 5) {
    return <div className="min-w-0">
      <Select value={value} onValueChange={onValueChange} disabled={disabled} open={controlledOpen} onOpenChange={onOpenChange} name={name} required={required}>
        <SelectTrigger {...triggerProps} className={cn("w-full", className)} aria-label={triggerProps?.["aria-label"] ?? placeholder}><SelectValue placeholder={placeholder} /></SelectTrigger>
        <SelectContent className={contentClassName}>
          {options.map(option => <SelectItem key={option.value} value={option.value} disabled={option.disabled}>{option.label}</SelectItem>)}
          {options.length === 0 && <p className="px-2 py-1.5 text-sm text-muted-foreground">{emptyText}</p>}
        </SelectContent>
      </Select>
      {onAddOption && <Button type="button" variant="ghost" size="sm" onClick={() => onAddOption("")}><Plus className="mr-2 size-4" />{addOptionLabel}</Button>}
    </div>;
  }

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      {name && <input type="hidden" name={name} value={value ?? ""} disabled={disabled} />}
      <PopoverTrigger asChild>
        <Button
          {...triggerProps}
          variant="outline"
          role="combobox"
          aria-expanded={open}
          aria-label={triggerProps?.["aria-label"] ?? placeholder}
          title={selected ? optionText(selected.label) : undefined}
          disabled={disabled}
          className={cn("w-full justify-between font-normal text-left min-w-0 whitespace-normal h-auto py-2", className)}
        >
          <span className="min-w-0 break-words [overflow-wrap:anywhere]">{selected ? selected.label : placeholder}</span>
          <ChevronsUpDown className="ml-2 size-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        className={cn("w-[var(--radix-popover-trigger-width)] p-0", contentClassName)}
        align="start"
      >
        <Command shouldFilter={false}>
          <CommandInput
            placeholder={searchPlaceholder}
            value={search}
            onValueChange={setSearch}
          />
          <CommandList>
            {filteredOptions.length === 0 ? (
              <div className="px-2 py-1.5 text-sm text-muted-foreground">
                {emptyText}
              </div>
            ) : (
              <CommandGroup>
                {filteredOptions.map((option) => (
                  <CommandItem
                    key={option.value}
                    value={optionText(option.label) + " " + option.value}
                    disabled={option.disabled}
                    onSelect={() => {
                      onValueChange(option.value);
                      setOpen(false);
                      setSearch("");
                    }}
                  >
                    <Check
                      className={cn(
                        "mr-2 size-4",
                        value === option.value ? "opacity-100" : "opacity-0",
                      )}
                    />
                    {option.label}
                  </CommandItem>
                ))}
              </CommandGroup>
            )}
          </CommandList>
          {showAddOption && (
            <div className="border-t p-1">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="w-full justify-start text-primary font-medium"
                onClick={() => {
                  setOpen(false);
                  setSearch("");
                  onAddOption?.(search);
                }}
              >
                <Plus className="mr-2 size-4" />
                {addOptionLabel}
              </Button>
            </div>
          )}
        </Command>
      </PopoverContent>
    </Popover>
  );
}
