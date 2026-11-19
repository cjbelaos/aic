"use client";

import type { DeliveryItem } from "@/types/deliveryReceipt";
import { formatSerialCell, serialShortfall, warrantyStatus } from "@/lib/deliverySerials";

type RequiresSerial = (item: DeliveryItem) => boolean;

/** Serials plus warranty / missing-serial tags for one delivered line. */
export function DeliveryItemSerialTags({
  item,
  date,
  status,
  requiresSerial,
}: {
  item: DeliveryItem;
  date: string;
  status: string;
  requiresSerial: RequiresSerial;
}) {
  const serials = item.serialNumbers ?? [];
  const warranty = warrantyStatus({ date, status, serialCount: serials.length }, new Date());
  const shortfall = serialShortfall({ requiresSerial: requiresSerial(item), quantity: item.quantity, serialCount: serials.length });
  if (!serials.length && !shortfall) return null;
  return (
    <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs">
      {serials.length > 0 && <span className="text-muted-foreground">S/N: {formatSerialCell(serials)}</span>}
      {warranty && (
        <span
          className={
            warranty.state === "active"
              ? "rounded bg-emerald-50 px-1.5 py-0.5 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300"
              : "rounded bg-muted px-1.5 py-0.5 text-muted-foreground"
          }
        >
          {warranty.label}
        </span>
      )}
      {shortfall && (
        <span className="rounded bg-amber-50 px-1.5 py-0.5 text-amber-700 dark:bg-amber-950 dark:text-amber-300">
          {shortfall.label}
        </span>
      )}
    </div>
  );
}

/** Register cell: item names with serials and tags, first `limit` items then "+N more". */
export function DeliveryItemSummary({
  items,
  date,
  status,
  requiresSerial,
  limit,
  nameFor,
}: {
  items: DeliveryItem[];
  date: string;
  status: string;
  requiresSerial: RequiresSerial;
  limit?: number;
  nameFor?: (item: DeliveryItem) => string;
}) {
  if (!items.length) return <span className="text-xs text-muted-foreground">No items</span>;
  const shown = limit ? items.slice(0, limit) : items;
  const hidden = items.length - shown.length;
  return (
    <div className="min-w-[12rem] max-w-[22rem] space-y-1 text-sm">
      {shown.map((item, index) => (
        <div key={item.deliveryReceiptItemId ?? index}>
          <div className="truncate">
            <span className="tabular-nums text-muted-foreground">{item.quantity}×</span>{" "}
            {nameFor?.(item) || item.description || item.productCode || "—"}
          </div>
          <DeliveryItemSerialTags item={item} date={date} status={status} requiresSerial={requiresSerial} />
        </div>
      ))}
      {hidden > 0 && <div className="text-xs text-muted-foreground">+{hidden} more</div>}
    </div>
  );
}
