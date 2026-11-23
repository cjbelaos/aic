"use client";

import { useEffect, useMemo, useState } from "react";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import warehouseService from "@/lib/services/warehouse.service";
import type { AccessLevel, StockCheck } from "@/lib/inventory/domain";
import type { Warehouse } from "@/types/warehouse";

// Stock helpers for the Delivery Receipt and Stock Transfer forms: an active
// warehouse picker, a debounced stock-check preview and per-line hints. The
// server re-checks on save; these are guidance only.

export function useActiveWarehouses(): Warehouse[] {
  const [warehouses, setWarehouses] = useState<Warehouse[]>([]);
  useEffect(() => {
    warehouseService.getAll().then((rows) => setWarehouses(rows.filter((w) => w.active))).catch(() => setWarehouses([]));
  }, []);
  return warehouses;
}

export function useStockCheck(input: {
  /** Fallback warehouse for lines without their own (Stock Transfers send only this). */
  warehouseId?: string;
  lines: { warehouseId?: string; productId?: string; productCode?: string; quantity: number }[];
  excludeDrNumber?: number;
  excludeTransferId?: string;
  enabled?: boolean;
}): { check: StockCheck | null; level: AccessLevel | null } {
  const [state, setState] = useState<{ check: StockCheck | null; level: AccessLevel | null }>({ check: null, level: null });
  const key = useMemo(
    () => JSON.stringify({ w: input.warehouseId ?? "", l: input.lines.map((l) => [l.warehouseId ?? "", l.productId || l.productCode || "", l.quantity]), d: input.excludeDrNumber, t: input.excludeTransferId }),
    [input.warehouseId, input.lines, input.excludeDrNumber, input.excludeTransferId],
  );
  const enabled = input.enabled !== false && (Boolean(input.warehouseId) || input.lines.some((l) => l.warehouseId));
  useEffect(() => {
    if (!enabled) return;
    const controller = new AbortController();
    const timer = setTimeout(() => {
      const body = JSON.parse(key) as { w: string; d?: number; t?: string };
      fetch("/api/inventory/check", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        signal: controller.signal,
        body: JSON.stringify({
          warehouseId: body.w,
          lines: input.lines,
          excludeDrNumber: body.d,
          excludeTransferId: body.t,
        }),
      })
        .then(async (res) => (res.ok ? ((await res.json()) as { check: StockCheck; level: AccessLevel }) : null))
        .then((data) => { if (data) setState({ check: data.check, level: data.level }); })
        .catch(() => {});
    }, 400);
    return () => { clearTimeout(timer); controller.abort(); };
    // `key` captures the inputs that matter; `input.lines` is read at fire time.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, enabled]);
  // A disabled check (no warehouse, closed form) shows no hints.
  return enabled ? state : { check: null, level: state.level };
}

export function WarehouseSelect({ value, onChange, warehouses, disabled, label = "From warehouse", required = true }: {
  value: string;
  onChange: (value: string) => void;
  warehouses: Warehouse[];
  disabled?: boolean;
  label?: string;
  required?: boolean;
}) {
  return (
    <div className="space-y-2">
      <Label>
        {label} {required && <span className="text-destructive">*</span>}
      </Label>
      <Select value={value} onValueChange={onChange} disabled={disabled}>
        <SelectTrigger className="w-full">
          <SelectValue placeholder="Select warehouse" />
        </SelectTrigger>
        <SelectContent>
          {warehouses.map((w) => (
            <SelectItem key={w.warehouseId} value={w.warehouseId}>{w.name}</SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

/** One line's stock status: "8 on hand · 4 safety · 4 available", in red when blocked. */
export function StockLineHint({ check, productId, warehouseId, warehouseName, productName }: {
  check: StockCheck | null;
  productId: string;
  /** Match the check line for this warehouse; omitted = the product's first line. */
  warehouseId?: string;
  warehouseName: string;
  productName: string;
}) {
  const line = check?.lines.find((l) => l.productId === productId && (!warehouseId || l.warehouseId === warehouseId));
  if (!line) return null;
  if (line.result === "blocked") {
    return (
      <p className="text-xs text-destructive">
        Not enough stock at {warehouseName}: {productName} needs {line.requested}, {line.onHand} on hand
      </p>
    );
  }
  return (
    <p className={line.result === "needs_approval" ? "text-xs text-amber-600 dark:text-amber-400" : "text-xs text-muted-foreground"}>
      {line.onHand} on hand · {line.safetyStock} safety · {line.available} available
      {line.result === "needs_approval" ? ` · needs approval (uses ${line.safetyUsed} of ${line.safetyStock} safety stock)` : ""}
    </p>
  );
}

/** Confirm text when a save would dip into safety stock, or null when no approval is needed. */
export function approvalPrompt(check: StockCheck | null, level: AccessLevel | null, warehouseName: (id: string) => string, productName: (id: string) => string): string | null {
  if (!check || check.result !== "needs_approval" || level === "manage") return null;
  const lines = check.lines
    .filter((l) => l.result === "needs_approval")
    .map((l) => `${productName(l.productId)} at ${warehouseName(l.warehouseId)}: uses ${l.safetyUsed} of ${l.safetyStock} safety stock`);
  return `Needs approval: uses safety stock.\n\n${lines.join("\n")}\n\nIt will be sent to a manager and cannot be printed until approved. Continue?`;
}
