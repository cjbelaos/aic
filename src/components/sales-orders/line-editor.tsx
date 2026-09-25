"use client";

import * as React from "react";
import { Package, Plus, Trash2, Wrench } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SearchableSelect } from "@/components/ui/searchable-select";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { money } from "@/components/sales-orders/badges";
import type {
  OptionsResponse,
  OrderLineInput,
} from "@/lib/services/sales-order.service";
import {
  COMBINED_CHARGE_DESCRIPTION,
  PRICE_SOURCE_NOT_PRICED,
  SALES_ORDER_PRODUCT_CATEGORY,
  SALES_ORDER_SERVICE_CATEGORY,
  SHIPPING_LINE_DESCRIPTION,
} from "@/types/salesOrder";

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

/** A descriptive line carried from a single-total quotation: no price of its own. */
function isNotPriced(line: OrderLineInput): boolean {
  return (line.priceSource ?? "") === PRICE_SOURCE_NOT_PRICED;
}

/** The one auditable line that carries a single-total quotation's combined price. */
function isCombinedCharge(line: OrderLineInput): boolean {
  return (
    line.priceSource === "QUOTATION" &&
    line.description === COMBINED_CHARGE_DESCRIPTION
  );
}

function lineTotal(line: OrderLineInput): number | null {
  if (isNotPriced(line)) return null;
  if (line.quantity === null || line.unitPrice === null) return null;
  const payable = Math.max(
    0,
    line.quantity * line.unitPrice - (line.discountAmount ?? 0),
  );
  return line.taxMode === "VAT_EXCLUSIVE"
    ? payable * (1 + (line.taxRate ?? 0))
    : payable;
}

export function LineEditor({
  lines,
  onChange,
  units,
  products,
  orderCategories,
}: LineEditorProps): React.ReactNode {
  const update = (index: number, patch: Partial<OrderLineInput>): void =>
    onChange(
      lines.map((line, current) =>
        current === index ? { ...line, ...patch } : line,
      ),
    );
  const remove = (index: number): void =>
    onChange(lines.filter((_, current) => current !== index));
  const productOptions = products.map((product) => ({
    value: product.productId,
    label: `${product.productName} (${product.productCode})`,
  }));
  const configuredUnitOptions = units.map((unit) => ({
    value: unit.unitId,
    label: `${unit.unitName}${unit.unitCode && unit.unitCode !== unit.unitName ? ` (${unit.unitCode})` : ""}`,
  }));
  // Services never pick a category (it is assigned automatically for the
  // Services/ Repair reporting view), so product choices exclude it.
  const productCategories = orderCategories.filter(
    (category) => category !== SALES_ORDER_SERVICE_CATEGORY,
  );

  const selectProduct = (index: number, productId: string): void => {
    const product = products.find(
      (candidate) => candidate.productId === productId,
    );
    if (!product) return;
    update(index, {
      lineType: "PRODUCT",
      productId: product.productId,
      productCodeSnapshot: product.productCode,
      productNameSnapshot: product.productName,
      description: product.productName,
      unitId: product.unitId,
      unitSnapshot:
        units.find((unit) => unit.unitId === product.unitId)?.unitCode ||
        product.unitId,
      unitPrice: product.defaultSellingPrice,
      priceSource: "DEFAULT_PRICE",
    });
  };

  /**
   * Switches a line between Product and Service. Product references are always
   * cleared (invalid for a service and stale after a re-pick) while the user's
   * own description, quantity, unit and price are retained.
   */
  const switchLineType = (index: number, next: "PRODUCT" | "SERVICE"): void => {
    const line = lines[index];
    if (!line) return;
    const wasProductPriced =
      line.priceSource === "DEFAULT_PRICE" ||
      line.priceSource === "CUSTOMER_PRICE";
    const priceSource =
      next === "SERVICE" && wasProductPriced && line.unitPrice !== null
        ? "MANUAL"
        : line.priceSource;
    update(index, {
      lineType: next,
      productId: "",
      productCodeSnapshot: "",
      productNameSnapshot: "",
      customerProductPriceId: "",
      customerProductName: "",
      priceSource,
      orderCategory:
        next === "SERVICE"
          ? SALES_ORDER_SERVICE_CATEGORY
          : productCategories.includes(line.orderCategory ?? "")
            ? line.orderCategory
            : SALES_ORDER_PRODUCT_CATEGORY,
    });
  };

  return (
    <div className="space-y-3">
      {lines.length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-md border border-dashed p-10 text-center text-sm text-muted-foreground">
          <Package className="h-8 w-8 text-muted-foreground/50" />
          No items yet. Add a product or service line to continue.
        </div>
      ) : null}
      {lines.map((line, index) => (
        <div
          key={line.salesOrderItemId ?? index}
          className="rounded-lg border bg-background p-4 shadow-sm transition-shadow hover:shadow-md"
        >
          {(() => {
            const unitOptions =
              line.unitId &&
              !configuredUnitOptions.some(
                (option) => option.value === line.unitId,
              )
                ? [
                    {
                      value: line.unitId,
                      label: line.unitSnapshot || line.unitId,
                    },
                    ...configuredUnitOptions,
                  ]
                : configuredUnitOptions;
            const isQuotationShipping =
              line.quotationLineReference?.endsWith(":SHIPPING") === true ||
              line.description === SHIPPING_LINE_DESCRIPTION;
            const notPriced = isNotPriced(line);
            const combinedCharge = isCombinedCharge(line);
            const categoryOptions =
              line.orderCategory &&
              !productCategories.includes(line.orderCategory)
                ? [line.orderCategory, ...productCategories]
                : productCategories;
            const subtitle = isQuotationShipping
              ? "Copied from the quotation and included in VAT"
              : combinedCharge
                ? "One combined price as quoted — the described lines keep no separate price"
                : notPriced
                  ? "No separate price — included in the combined total"
                  : line.productCodeSnapshot ||
                    (line.lineType === "SERVICE"
                      ? "Service / repair work described manually"
                      : "Select a product");
            const TypeIcon = line.lineType === "SERVICE" ? Wrench : Package;
            return (
              <>
                <div className="mb-4 flex items-start justify-between gap-3 border-b pb-3">
                  <div className="flex items-start gap-2.5">
                    <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground">
                      <TypeIcon className="h-4 w-4" />
                    </div>
                    <div>
                      <p className="font-medium leading-tight">
                        {isQuotationShipping
                          ? "Shipping charge"
                          : combinedCharge
                            ? "Combined charge"
                            : `Item ${index + 1}`}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {subtitle}
                      </p>
                    </div>
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="shrink-0 text-muted-foreground hover:text-destructive"
                    aria-label={`Remove item ${index + 1}`}
                    onClick={() => remove(index)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>

                <div className="grid grid-cols-1 gap-x-4 gap-y-4 sm:grid-cols-2 md:grid-cols-12">
                  <Field label="Line type" className="md:col-span-2">
                    <Select
                      value={line.lineType}
                      onValueChange={(value) =>
                        switchLineType(
                          index,
                          value === "SERVICE" ? "SERVICE" : "PRODUCT",
                        )
                      }
                    >
                      <SelectTrigger className="w-full">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="PRODUCT">Product</SelectItem>
                        <SelectItem value="SERVICE">Service</SelectItem>
                      </SelectContent>
                    </Select>
                  </Field>
                  {line.lineType === "PRODUCT" ? (
                    <Field
                      label="Product"
                      className="sm:col-span-2 md:col-span-6"
                    >
                      <SearchableSelect
                        value={line.productId}
                        onValueChange={(value) => selectProduct(index, value)}
                        options={productOptions}
                        placeholder="Select product…"
                        searchPlaceholder="Search product or SKU…"
                      />
                    </Field>
                  ) : (
                    <Field
                      label="Service description"
                      className="sm:col-span-2 md:col-span-6"
                    >
                      <Input
                        value={line.description}
                        onChange={(event) =>
                          update(index, { description: event.target.value })
                        }
                        placeholder="Describe the service or repair work"
                      />
                    </Field>
                  )}
                  {line.lineType === "PRODUCT" ? (
                    <Field label="Category" className="md:col-span-4">
                      <Select
                        value={line.orderCategory || ""}
                        onValueChange={(value) =>
                          update(index, { orderCategory: value })
                        }
                      >
                        <SelectTrigger className="w-full">
                          <SelectValue placeholder="Select category" />
                        </SelectTrigger>
                        <SelectContent>
                          {categoryOptions.map((category) => (
                            <SelectItem key={category} value={category}>
                              {category}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </Field>
                  ) : (
                    <Field label="Category" className="md:col-span-4">
                      <div
                        className="flex h-9 items-center rounded-md border border-dashed bg-muted/40 px-3 text-sm text-muted-foreground"
                        title="Assigned automatically for Services/ Repair reporting; no choice is required."
                      >
                        {SALES_ORDER_SERVICE_CATEGORY} · automatic
                      </div>
                    </Field>
                  )}

                  {line.lineType === "PRODUCT" ? (
                    <Field
                      label="Description"
                      className="sm:col-span-2 md:col-span-6"
                    >
                      <Input
                        value={line.description}
                        onChange={(event) =>
                          update(index, { description: event.target.value })
                        }
                        placeholder="Line description"
                      />
                    </Field>
                  ) : null}
                  <Field
                    label="Unit"
                    className={
                      line.lineType === "PRODUCT"
                        ? "md:col-span-2"
                        : "md:col-span-4"
                    }
                  >
                    <SearchableSelect
                      value={line.unitId}
                      onValueChange={(value) =>
                        update(index, {
                          unitId: value,
                          unitSnapshot:
                            units.find((unit) => unit.unitId === value)
                              ?.unitCode || value,
                        })
                      }
                      options={unitOptions}
                      placeholder="Unit…"
                    />
                  </Field>
                  <Field
                    label="Quantity"
                    className={
                      line.lineType === "PRODUCT"
                        ? "md:col-span-2"
                        : "md:col-span-4"
                    }
                  >
                    <NumberInput
                      value={line.quantity}
                      onChange={(value) => update(index, { quantity: value })}
                      placeholder="0"
                    />
                  </Field>
                  <Field
                    label="Unit price"
                    className={
                      line.lineType === "PRODUCT"
                        ? "md:col-span-2"
                        : "md:col-span-4"
                    }
                  >
                    <NumberInput
                      value={line.unitPrice}
                      onChange={(value) =>
                        update(index, {
                          unitPrice: value,
                          priceSource:
                            value === null ? line.priceSource : "MANUAL",
                        })
                      }
                      placeholder={notPriced ? "Included" : "0.00"}
                      prefix="₱"
                    />
                    {notPriced ? (
                      <p className="mt-1 text-xs text-muted-foreground">
                        Included in the combined total. Type a price to price
                        this line separately.
                      </p>
                    ) : null}
                  </Field>

                  <div className="col-span-full grid grid-cols-1 gap-4 rounded-md bg-muted/20 p-3 sm:grid-cols-2 md:grid-cols-12">
                    <Field label="Discount" className="md:col-span-6">
                      <NumberInput
                        value={line.discountAmount ?? 0}
                        onChange={(value) =>
                          update(index, { discountAmount: value ?? 0 })
                        }
                        placeholder="0.00"
                        prefix="₱"
                      />
                    </Field>
                    <Field label="VAT" className="md:col-span-6">
                      <Select
                        value={line.taxMode || "VAT_INCLUSIVE"}
                        onValueChange={(value) =>
                          update(index, {
                            taxMode: value,
                            taxRate:
                              value === "VAT_EXEMPT" || value === "ZERO_RATED"
                                ? 0
                                : 0.12,
                          })
                        }
                      >
                        <SelectTrigger className="w-full">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="VAT_INCLUSIVE">
                            VAT inclusive
                          </SelectItem>
                          <SelectItem value="VAT_EXCLUSIVE">
                            VAT exclusive
                          </SelectItem>
                          <SelectItem value="VAT_EXEMPT">VAT exempt</SelectItem>
                          <SelectItem value="ZERO_RATED">Zero-rated</SelectItem>
                        </SelectContent>
                      </Select>
                    </Field>
                  </div>
                </div>

                <div className="mt-4 flex items-center justify-end gap-3 border-t pt-3 text-sm">
                  <span className="text-muted-foreground">Line total</span>
                  <strong className="min-w-28 text-right text-base tabular-nums">
                    {notPriced ? (
                      <span className="text-sm font-normal text-muted-foreground">
                        Included in the combined total
                      </span>
                    ) : (
                      money(lineTotal(line))
                    )}
                  </strong>
                </div>
              </>
            );
          })()}
        </div>
      ))}
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() => onChange([...lines, emptyLine()])}
      >
        <Plus className="mr-2 h-4 w-4" />
        Add Item
      </Button>
    </div>
  );
}

function Field({
  label,
  className,
  children,
}: {
  label: string;
  className?: string;
  children: React.ReactNode;
}): React.ReactNode {
  return (
    <div className={className}>
      <Label className="mb-1.5 block text-xs text-muted-foreground">
        {label}
      </Label>
      {children}
    </div>
  );
}

function NumberInput({
  value,
  onChange,
  placeholder,
  prefix,
}: {
  value: number | null;
  onChange: (value: number | null) => void;
  placeholder: string;
  prefix?: string;
}): React.ReactNode {
  if (!prefix) {
    return (
      <Input
        type="number"
        min="0"
        step="0.01"
        inputMode="decimal"
        value={value === null ? "" : String(value)}
        onChange={(event) =>
          onChange(
            event.target.value === ""
              ? null
              : Number.parseFloat(event.target.value),
          )
        }
        placeholder={placeholder}
      />
    );
  }
  return (
    <div className="relative">
      <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
        {prefix}
      </span>
      <Input
        type="number"
        min="0"
        step="0.01"
        inputMode="decimal"
        value={value === null ? "" : String(value)}
        onChange={(event) =>
          onChange(
            event.target.value === ""
              ? null
              : Number.parseFloat(event.target.value),
          )
        }
        placeholder={placeholder}
        className="pl-7"
      />
    </div>
  );
}
