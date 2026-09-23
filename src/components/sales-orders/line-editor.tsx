"use client";

import * as React from "react";
import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SearchableSelect } from "@/components/ui/searchable-select";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { money } from "@/components/sales-orders/badges";
import type { OptionsResponse, OrderLineInput } from "@/lib/services/sales-order.service";

export interface LineEditorProps {
  lines: OrderLineInput[];
  onChange: (lines: OrderLineInput[]) => void;
  units: OptionsResponse["units"];
  products: OptionsResponse["products"];
  orderCategories: string[];
}

const emptyLine = (): OrderLineInput => ({
  lineType: "PRODUCT",
  description: "",
  unitId: "",
  quantity: 1,
  unitPrice: null,
  taxMode: "VAT_INCLUSIVE",
  taxRate: 0.12,
  discountAmount: 0,
  orderCategory: "Parts",
});

function lineTotal(line: OrderLineInput): number | null {
  if (line.quantity === null || line.unitPrice === null) return null;
  const payable = Math.max(0, line.quantity * line.unitPrice - (line.discountAmount ?? 0));
  return line.taxMode === "VAT_EXCLUSIVE" ? payable * (1 + (line.taxRate ?? 0)) : payable;
}

export function LineEditor({ lines, onChange, units, products, orderCategories }: LineEditorProps): React.ReactNode {
  const update = (index: number, patch: Partial<OrderLineInput>): void => onChange(lines.map((line, current) => current === index ? { ...line, ...patch } : line));
  const remove = (index: number): void => onChange(lines.filter((_, current) => current !== index));
  const productOptions = products.map((product) => ({ value: product.productId, label: `${product.productName} (${product.productCode})` }));
  const configuredUnitOptions = units.map((unit) => ({ value: unit.unitId, label: `${unit.unitName}${unit.unitCode && unit.unitCode !== unit.unitName ? ` (${unit.unitCode})` : ""}` }));

  const selectProduct = (index: number, productId: string): void => {
    const product = products.find((candidate) => candidate.productId === productId);
    if (!product) return;
    update(index, {
      lineType: "PRODUCT",
      productId: product.productId,
      productCodeSnapshot: product.productCode,
      productNameSnapshot: product.productName,
      description: product.productName,
      unitId: product.unitId,
      unitSnapshot: units.find((unit) => unit.unitId === product.unitId)?.unitCode || product.unitId,
      unitPrice: product.defaultSellingPrice,
      priceSource: "DEFAULT_PRICE",
    });
  };

  return (
    <div className="space-y-3">
      {lines.length === 0 ? <div className="rounded-md border border-dashed p-8 text-center text-sm text-muted-foreground">No items yet. Add a product or service line to continue.</div> : null}
      {lines.map((line, index) => (
        <div key={line.salesOrderItemId ?? index} className="rounded-lg border bg-background p-4 shadow-sm">
          {(() => {
            const unitOptions = line.unitId && !configuredUnitOptions.some((option) => option.value === line.unitId)
              ? [{ value: line.unitId, label: line.unitSnapshot || line.unitId }, ...configuredUnitOptions]
              : configuredUnitOptions;
            const isQuotationShipping = line.quotationLineReference?.endsWith(":SHIPPING") === true;
            return <>
          <div className="mb-4 flex items-center justify-between gap-3">
            <div><p className="font-medium">{isQuotationShipping ? "Shipping charge" : `Item ${index + 1}`}</p><p className="text-xs text-muted-foreground">{isQuotationShipping ? "Copied from the quotation and included in VAT" : line.productCodeSnapshot || (line.lineType === "SERVICE" ? "Custom service" : "Select a product")}</p></div>
            <Button type="button" variant="ghost" size="icon" className="text-muted-foreground hover:text-destructive" aria-label={`Remove item ${index + 1}`} onClick={() => remove(index)}><Trash2 className="h-4 w-4" /></Button>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-12">
            <Field label="Line type" className="md:col-span-2"><Select value={line.lineType} onValueChange={(value) => update(index, { lineType: value === "SERVICE" ? "SERVICE" : "PRODUCT", productId: value === "SERVICE" ? "" : line.productId, productCodeSnapshot: value === "SERVICE" ? "" : line.productCodeSnapshot })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="PRODUCT">Product</SelectItem><SelectItem value="SERVICE">Service</SelectItem></SelectContent></Select></Field>
            <Field label={line.lineType === "PRODUCT" ? "Product" : "Service description"} className="md:col-span-5">
              {line.lineType === "PRODUCT" ? <SearchableSelect value={line.productId} onValueChange={(value) => selectProduct(index, value)} options={productOptions} placeholder="Select product…" searchPlaceholder="Search product or SKU…" /> : <Input value={line.description} onChange={(event) => update(index, { description: event.target.value })} placeholder="Describe the service" />}
            </Field>
            <Field label="Category" className="md:col-span-3"><Select value={line.orderCategory || ""} onValueChange={(value) => update(index, { orderCategory: value })}><SelectTrigger><SelectValue placeholder="Category" /></SelectTrigger><SelectContent>{orderCategories.map((category) => <SelectItem key={category} value={category}>{category}</SelectItem>)}</SelectContent></Select></Field>
            <Field label="Unit" className="md:col-span-2"><SearchableSelect value={line.unitId} onValueChange={(value) => update(index, { unitId: value, unitSnapshot: units.find((unit) => unit.unitId === value)?.unitCode || value })} options={unitOptions} placeholder="Unit…" /></Field>

            <Field label="Description" className="md:col-span-4"><Input value={line.description} onChange={(event) => update(index, { description: event.target.value })} placeholder="Line description" /></Field>
            <Field label="Quantity" className="md:col-span-2"><NumberInput value={line.quantity} onChange={(value) => update(index, { quantity: value })} placeholder="0" /></Field>
            <Field label="Unit price" className="md:col-span-2"><NumberInput value={line.unitPrice} onChange={(value) => update(index, { unitPrice: value, priceSource: "MANUAL" })} placeholder="0.00" /></Field>
            <Field label="Discount" className="md:col-span-2"><NumberInput value={line.discountAmount ?? 0} onChange={(value) => update(index, { discountAmount: value ?? 0 })} placeholder="0.00" /></Field>
            <Field label="VAT" className="md:col-span-2"><Select value={line.taxMode || "VAT_INCLUSIVE"} onValueChange={(value) => update(index, { taxMode: value, taxRate: value === "VAT_EXEMPT" || value === "ZERO_RATED" ? 0 : 0.12 })}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="VAT_INCLUSIVE">VAT inclusive</SelectItem><SelectItem value="VAT_EXCLUSIVE">VAT exclusive</SelectItem><SelectItem value="VAT_EXEMPT">VAT exempt</SelectItem><SelectItem value="ZERO_RATED">Zero-rated</SelectItem></SelectContent></Select></Field>
          </div>

          <div className="mt-4 flex flex-wrap items-center justify-end gap-x-3 gap-y-1 border-t pt-3 text-sm"><span className="text-muted-foreground">Line total</span><strong className="min-w-28 text-right text-base tabular-nums">{money(lineTotal(line))}</strong></div>
            </>;
          })()}
        </div>
      ))}
      <Button type="button" variant="outline" size="sm" onClick={() => onChange([...lines, emptyLine()])}><Plus className="mr-2 h-4 w-4" />Add Item</Button>
    </div>
  );
}

function Field({ label, className, children }: { label: string; className?: string; children: React.ReactNode }): React.ReactNode {
  return <div className={className}><Label className="mb-1.5 block text-xs text-muted-foreground">{label}</Label>{children}</div>;
}

function NumberInput({ value, onChange, placeholder }: { value: number | null; onChange: (value: number | null) => void; placeholder: string }): React.ReactNode {
  return <Input type="number" min="0" step="0.01" inputMode="decimal" value={value === null ? "" : String(value)} onChange={(event) => onChange(event.target.value === "" ? null : Number.parseFloat(event.target.value))} placeholder={placeholder} />;
}
