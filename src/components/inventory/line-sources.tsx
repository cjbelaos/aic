"use client";

import { Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { StockLineHint } from "@/components/inventory/dr-stock";
import type { WarehouseSource } from "@/lib/deliverySources";
import type { StockCheck } from "@/lib/inventory/domain";
import type { Warehouse } from "@/types/warehouse";

// Where one DR line's quantity is taken from. An unsplit line shows a single
// warehouse picker; "Split" adds a second part so the line can draw from
// several warehouses (Salt 5 = A 2 + B 3). The printed DR still shows the line total.

export function LineSources({ value, onChange, quantity, warehouses, check, productId, productName, disabled }: {
  value: WarehouseSource[];
  onChange: (next: WarehouseSource[]) => void;
  quantity: number;
  warehouses: Warehouse[];
  check: StockCheck | null;
  productId: string;
  productName: string;
  disabled?: boolean;
}) {
  const nameOf = (id: string) => warehouses.find((w) => w.warehouseId === id)?.name || id || "this warehouse";
  const split = value.length > 1;
  const assigned = value.reduce((total, part) => total + (Number(part.quantity) || 0), 0);
  const patch = (index: number, next: Partial<WarehouseSource>) =>
    onChange(value.map((part, i) => (i === index ? { ...part, ...next } : part)));
  const addPart = () => {
    const used = new Set(value.map((p) => p.warehouseId));
    const nextWarehouse = warehouses.find((w) => !used.has(w.warehouseId))?.warehouseId ?? "";
    onChange([...value, { warehouseId: nextWarehouse, quantity: Math.max(quantity - assigned, 0) }]);
  };
  const removePart = (index: number) => {
    const rest = value.filter((_, i) => i !== index);
    // Back to one part: it takes the whole line again.
    onChange(rest.length === 1 ? [{ ...rest[0], quantity }] : rest);
  };

  return (
    <div className="mt-1 space-y-1">
      {value.map((part, index) => (
        <div key={index} className="space-y-0.5">
          <div className="flex items-center gap-1">
            <Select value={part.warehouseId} onValueChange={(warehouseId) => patch(index, { warehouseId })} disabled={disabled}>
              <SelectTrigger className="h-7 min-w-0 flex-1 text-xs" aria-label="Take from warehouse">
                <SelectValue placeholder="Warehouse" />
              </SelectTrigger>
              <SelectContent>
                {warehouses.map((w) => (
                  <SelectItem key={w.warehouseId} value={w.warehouseId} disabled={w.warehouseId !== part.warehouseId && value.some((p) => p.warehouseId === w.warehouseId)}>
                    {w.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {split && (
              <>
                <Input
                  type="number"
                  min={0}
                  className="h-7 w-16 text-xs"
                  aria-label="Quantity from this warehouse"
                  value={part.quantity}
                  onChange={(e) => patch(index, { quantity: Number(e.target.value) || 0 })}
                  disabled={disabled}
                />
                <Button type="button" variant="ghost" size="icon" className="h-7 w-7" onClick={() => removePart(index)} disabled={disabled} aria-label="Remove warehouse">
                  <X className="h-3 w-3" />
                </Button>
              </>
            )}
          </div>
          {productId && part.warehouseId && (
            <StockLineHint check={check} productId={productId} warehouseId={part.warehouseId} warehouseName={nameOf(part.warehouseId)} productName={productName} />
          )}
        </div>
      ))}
      <div className="flex items-center gap-2">
        {value.length < warehouses.length && quantity > 0 && (
          <Button type="button" variant="link" size="sm" className="h-auto p-0 text-xs" onClick={addPart} disabled={disabled}>
            <Plus className="mr-1 h-3 w-3" />
            {split ? "Add warehouse" : "Split"}
          </Button>
        )}
        {split && assigned !== quantity && (
          <span className="text-xs text-destructive">{assigned} of {quantity} assigned</span>
        )}
      </div>
    </div>
  );
}
