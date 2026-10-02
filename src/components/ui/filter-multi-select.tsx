"use client";

import { useState } from "react";
import { Check, ChevronsUpDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandInput, CommandList, CommandEmpty, CommandItem } from "@/components/ui/command";

export function FilterMultiSelect({ label, values, options, onChange }: {
  label: string;
  values: string[];
  options: { value: string; label: string }[];
  onChange: (values: string[]) => void;
}) {
  const [open, setOpen] = useState(false);
  return <Popover open={open} onOpenChange={setOpen}>
    <PopoverTrigger asChild><Button variant="outline" aria-label={`${label} filter, ${values.length} selected`} aria-expanded={open} className="w-full justify-between font-normal">
      <span>{values.length ? `${label} (${values.length})` : label === "Category" ? "All categories" : "All customers"}</span><ChevronsUpDown className="ml-2 size-4 opacity-50" />
    </Button></PopoverTrigger>
    <PopoverContent align="start" className="w-[min(24rem,calc(100vw-2rem))] p-0">
      <Command><CommandInput placeholder={`Search ${label.toLowerCase()}…`} /><CommandList>
        <CommandEmpty>No matches.</CommandEmpty>
        {options.map((option) => <CommandItem key={option.value} value={`${option.label} ${option.value}`} onSelect={() => onChange(values.includes(option.value) ? values.filter((value) => value !== option.value) : [...values, option.value])}>
          <Check aria-hidden="true" className={`size-4 ${values.includes(option.value) ? "opacity-100" : "opacity-0"}`} />
          <span className="min-w-0 whitespace-normal">{option.label}</span><span className="sr-only">{values.includes(option.value) ? "Selected" : "Not selected"}</span>
        </CommandItem>)}
      </CommandList></Command>
      <Button variant="ghost" className="w-full" onClick={() => onChange([])}>Clear {label.toLowerCase()}</Button>
    </PopoverContent>
  </Popover>;
}
