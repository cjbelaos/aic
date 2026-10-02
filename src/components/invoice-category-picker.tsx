"use client";

import { MANUAL_INVOICE_CATEGORIES, manualCategoryLabel } from "@/lib/serviceInvoiceFilters";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";

export function InvoiceCategoryPicker({ values, onChange, disabled = false }: { values: string[]; onChange: (values: string[]) => void; disabled?: boolean }) {
  return <fieldset disabled={disabled} className="min-w-0 max-w-full space-y-3">
    <legend className="text-sm font-medium">Invoice category</legend>
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">{MANUAL_INVOICE_CATEGORIES.map((category) => <label key={category} className="flex cursor-pointer items-center gap-2 text-sm">
      <Checkbox disabled={disabled} checked={values.includes(category)} onCheckedChange={(checked) => onChange(checked ? [...values, category] : values.filter((value) => value !== category))} />{category}
    </label>)}</div>
    <p className="text-sm text-muted-foreground">Category: {manualCategoryLabel(values)}. Project takes priority, then Service.</p>
    <Button type="button" variant="ghost" size="sm" disabled={disabled || !values.length} onClick={() => onChange([])}>Clear category</Button>
  </fieldset>;
}
