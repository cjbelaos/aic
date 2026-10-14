"use client";

import { MANUAL_INVOICE_CATEGORIES, manualCategoryLabel } from "@/lib/serviceInvoiceFilters";
import { Checkbox } from "radix-ui";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { useId, useState } from "react";
import { Check, ChevronDown, X } from "lucide-react";
import { Popover, PopoverAnchor, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

export function InvoiceCategoryPicker({ values, onChange, disabled = false }: { values: string[]; onChange: (values: string[]) => void; disabled?: boolean }) {
  const [open, setOpen] = useState(false);
  const id = useId();
  return <div role="group" aria-label="Invoice category" className="min-w-0 max-w-full space-y-1.5">
    <Label htmlFor={id}>Invoice category</Label>
    <Popover open={open && !disabled} onOpenChange={setOpen}>
      <PopoverAnchor asChild><div className="flex min-h-9 flex-wrap items-center gap-1 rounded-md border border-input py-1 pr-2 pl-2.5 shadow-xs dark:bg-input/30 dark:hover:bg-input/50">
        {values.map(value => <button key={value} type="button" disabled={disabled} aria-label={`Remove ${value}`} onClick={() => onChange(values.filter(category => category !== value))} className="inline-flex items-center gap-1 rounded-sm bg-secondary px-2 py-0.5 text-xs focus-visible:outline-2 focus-visible:outline-ring disabled:opacity-50">{value}<X className="size-3" aria-hidden="true" /></button>)}
        <PopoverTrigger asChild><button id={id} type="button" disabled={disabled} aria-label="Select invoice categories" className="flex min-h-6 min-w-20 flex-1 items-center justify-between gap-2 text-sm focus-visible:outline-2 focus-visible:outline-ring disabled:opacity-50"><span className="text-muted-foreground">{values.length ? "Add category" : "Select categories"}</span><ChevronDown className="size-4 shrink-0 text-muted-foreground" /></button></PopoverTrigger>
      </div></PopoverAnchor>
      <PopoverContent align="start" aria-label="Invoice categories" className="w-[var(--radix-popover-trigger-width)] max-h-[var(--radix-popover-content-available-height)] overflow-y-auto border-0 p-1 shadow-md ring-1 ring-foreground/10">
        <div>{MANUAL_INVOICE_CATEGORIES.map(category => <Checkbox.Root key={category} disabled={disabled} checked={values.includes(category)} onCheckedChange={checked => onChange(checked === true ? [...values, category] : values.filter(value => value !== category))} className="relative flex w-full cursor-default items-center rounded-sm py-1.5 pr-8 pl-2 text-left text-sm outline-none select-none hover:bg-accent focus-visible:bg-accent focus-visible:text-accent-foreground disabled:opacity-50">
          {category}<Checkbox.Indicator className="absolute right-2 flex size-4 items-center justify-center"><Check className="size-4" aria-hidden="true" /></Checkbox.Indicator>
        </Checkbox.Root>)}</div>
        <Button type="button" variant="ghost" size="sm" className="mt-1 w-full border-t" disabled={disabled || !values.length} onClick={() => onChange([])}>Clear all</Button>
        <p className="px-2 pb-1 text-xs text-muted-foreground">Project takes priority, then Service.</p>
      </PopoverContent>
    </Popover>
    {values.length > 0 && <p className="text-xs text-muted-foreground">Category: {manualCategoryLabel(values)}</p>}
  </div>;
}
