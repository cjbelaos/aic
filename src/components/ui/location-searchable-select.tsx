"use client";

import * as React from "react";
import { Check, ChevronsUpDown, MapPinned, Building2 } from "lucide-react";
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

type Option = { value: string; label: string };

type LocationSearchableSelectProps = {
  value?: string;
  onValueChange: (value: string) => void;
  options: Option[];
  placeholder?: string;
  searchPlaceholder?: string;
  emptyText?: string;
  disabled?: boolean;
  className?: string;
  onAddLocation?: () => void;
  addLocationLabel?: string;
  onAddCompany?: () => void;
  addCompanyLabel?: string;
};

/**
 * Dropdown select for locations. When the user searches and no results are
 * found, action buttons appear so they can add a new location on the fly
 * (and optionally a new company/client). Clicking either closes the dropdown
 * without selecting a value.
 *
 * Filtering is done manually (shouldFilter={false}) and the empty state is
 * rendered as plain DOM instead of a CommandItem inside CommandEmpty, which
 * avoids cmdk's "Maximum update depth exceeded" infinite-loop issue.
 */
export function LocationSearchableSelect({
  value,
  onValueChange,
  options,
  placeholder = "Select...",
  searchPlaceholder = "Search...",
  emptyText = "No results found.",
  disabled,
  className,
  onAddLocation,
  addLocationLabel = "+ Add Location",
  onAddCompany,
  addCompanyLabel = "+ Add Company",
}: LocationSearchableSelectProps) {
  const [open, setOpen] = React.useState(false);
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
          o.label.toLowerCase().includes(query) ||
          o.value.toLowerCase().includes(query),
      )
    : options;

  const showAddActions =
    (!!onAddLocation || !!onAddCompany) &&
    query !== "" &&
    filteredOptions.length === 0;

  const handleAddLocation = () => {
    setOpen(false);
    setSearch("");
    onAddLocation?.();
  };

  const handleAddCompany = () => {
    setOpen(false);
    setSearch("");
    onAddCompany?.();
  };

  return (
    <Popover open={open} onOpenChange={handleOpenChange}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          role="combobox"
          aria-expanded={open}
          disabled={disabled}
          className={cn("w-full justify-between font-normal", className)}
        >
          {selected ? selected.label : placeholder}
          <ChevronsUpDown className="ml-2 size-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent
        className="w-[var(--radix-popover-trigger-width)] p-0"
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
                    value={option.label + " " + option.value}
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
          {showAddActions && (
            <div className="border-t p-1 flex flex-col gap-1">
              {onAddCompany && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="w-full justify-start text-primary font-medium"
                  onClick={handleAddCompany}
                >
                  <Building2 className="mr-2 size-4" />
                  {addCompanyLabel}
                </Button>
              )}
              {onAddLocation && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="w-full justify-start text-primary font-medium"
                  onClick={handleAddLocation}
                >
                  <MapPinned className="mr-2 size-4" />
                  {addLocationLabel}
                </Button>
              )}
            </div>
          )}
        </Command>
      </PopoverContent>
    </Popover>
  );
}
