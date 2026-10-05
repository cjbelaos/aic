"use client";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { DiscountSettings } from "@/lib/discounts";

export function DiscountInput({ value, onChange, disabled, showMode = false, showScope = false }: {
  value: DiscountSettings; onChange: (value: DiscountSettings) => void; disabled?: boolean; showMode?: boolean; showScope?: boolean;
}) {
  const patch = (changes: Partial<DiscountSettings>) => onChange({ ...value, ...changes });
  return <div className="flex flex-wrap items-center gap-2">
    {showMode && <Select disabled={disabled} value={value.mode} onValueChange={selected => patch({ mode: selected as DiscountSettings["mode"], value: 0 })}>
        <SelectTrigger aria-label="Discount mode"><SelectValue /></SelectTrigger>
        <SelectContent><SelectItem value="OVERALL">Overall discount</SelectItem><SelectItem value="PER_ITEM">Per-item discounts</SelectItem></SelectContent>
      </Select>}
    {(!showMode || value.mode === "OVERALL") && <>
      <Select disabled={disabled} value={value.type} onValueChange={selected => patch({ type: selected as DiscountSettings["type"], value: 0 })}>
        <SelectTrigger aria-label="Discount type"><SelectValue /></SelectTrigger>
        <SelectContent><SelectItem value="PESO">₱ Amount</SelectItem><SelectItem value="PERCENT">% Percentage</SelectItem></SelectContent>
      </Select>
      <Input aria-label="Discount value" type="number" min="0" max={value.type === "PERCENT" ? 100 : undefined} step="0.01" className="w-32" disabled={disabled} value={value.value || ""} placeholder="0" onChange={e => patch({ value: Number(e.target.value) || 0 })} />
      {value.type === "PERCENT" && <Select disabled={disabled} value={value.basis} onValueChange={selected => patch({ basis: selected as DiscountSettings["basis"] })}>
        <SelectTrigger aria-label="Percentage discount basis"><SelectValue /></SelectTrigger>
        <SelectContent><SelectItem value="VAT_INCLUSIVE">VAT-inclusive basis</SelectItem><SelectItem value="VAT_EXCLUSIVE">VAT-exclusive basis</SelectItem></SelectContent>
      </Select>}
      {showScope && value.type === "PESO" && <Select disabled={disabled} value={value.scope} onValueChange={selected => patch({ scope: selected as DiscountSettings["scope"] })}>
        <SelectTrigger aria-label="Item discount scope"><SelectValue /></SelectTrigger>
        <SelectContent><SelectItem value="FULL_LINE">Full line</SelectItem><SelectItem value="PER_UNIT">Per unit</SelectItem></SelectContent>
      </Select>}
    </>}
  </div>;
}
