// Where a Delivery Receipt line's quantity is taken from: one or more warehouse
// parts (Salt 5 = WH-A 2 + WH-B 3). Only inventory reads these; the printed DR,
// Sales Order fulfillment and contract releases use the line's total quantity.
//
// Stored in DeliveryReceiptItems column L as "WH-A:2;WH-B:3". A line with no
// stored parts (every DR saved before this column existed) takes its whole
// quantity from the DR's header warehouse (DeliveryReceipts column T).
//
// Pure module: no "@/" imports, so the focused tests can compile it.

export interface WarehouseSource {
  warehouseId: string;
  quantity: number;
}

export function parseSourcesCell(cell: unknown): WarehouseSource[] {
  return String(cell ?? "")
    .split(";")
    .map((part) => {
      const at = part.lastIndexOf(":");
      return { warehouseId: part.slice(0, at).trim(), quantity: Number(part.slice(at + 1)) };
    })
    .filter((part) => part.warehouseId && Number.isFinite(part.quantity) && part.quantity > 0);
}

export function formatSourcesCell(sources: readonly WarehouseSource[] | undefined): string {
  return (sources ?? []).map((s) => `${s.warehouseId}:${s.quantity}`).join(";");
}

/** The warehouse parts a line takes stock from, falling back to the header warehouse. */
export function lineSources(
  item: { quantity: number; sources?: readonly WarehouseSource[] },
  headerWarehouseId: string | undefined,
): WarehouseSource[] {
  const stored = (item.sources ?? []).filter((s) => s.warehouseId && Number(s.quantity) > 0);
  if (stored.length) return stored.map((s) => ({ warehouseId: s.warehouseId, quantity: Number(s.quantity) }));
  const quantity = Number(item.quantity) || 0;
  return headerWarehouseId && quantity > 0 ? [{ warehouseId: headerWarehouseId, quantity }] : [];
}

/** First reason a DR's line warehouses cannot be saved, or null. Untracked products are not checked. */
export function validateLineSources(
  lines: { productName: string; quantity: number; tracked: boolean; sources: readonly WarehouseSource[] }[],
  isActiveWarehouse: (warehouseId: string) => boolean,
): string | null {
  for (const line of lines) {
    if (!line.tracked) continue;
    const name = line.productName;
    if (!line.sources.length) return `${name}: choose a warehouse.`;
    if (line.sources.some((s) => !isActiveWarehouse(s.warehouseId))) return `${name}: warehouse must be an active warehouse.`;
    if (new Set(line.sources.map((s) => s.warehouseId)).size !== line.sources.length) return `${name}: each warehouse can appear once.`;
    const sum = line.sources.reduce((total, s) => total + (Number(s.quantity) || 0), 0);
    if (sum !== Number(line.quantity)) return `${name}: warehouse quantities (${sum}) must add up to ${line.quantity}.`;
  }
  return null;
}

/** Stable key of a DR's stock effect, for "did the stock-relevant part change" comparisons. */
export function effectiveSourcesKey(
  items: { productId?: string; productCode?: string; quantity: number; sources?: readonly WarehouseSource[] }[] | undefined,
  headerWarehouseId: string | undefined,
): string {
  return JSON.stringify(
    (items ?? [])
      .flatMap((item) => lineSources(item, headerWarehouseId).map((s) => `${item.productId || item.productCode || ""}@${s.warehouseId}:${s.quantity}`))
      .sort(),
  );
}

/** Keeps an unsplit line's single part in step with its quantity; a split (2+ parts) is left alone. */
export function syncSingleSource(sources: readonly WarehouseSource[] | undefined, quantity: number, defaultWarehouseId: string): WarehouseSource[] {
  const parts = sources ?? [];
  if (parts.length > 1) return [...parts];
  const warehouseId = parts[0]?.warehouseId || defaultWarehouseId;
  return warehouseId ? [{ warehouseId, quantity }] : [];
}

/** True when every line with a quantity has warehouse parts adding up to it. */
export function sourcesComplete(lines: { quantity: number; sources?: readonly WarehouseSource[] }[]): boolean {
  return lines.every((line) => {
    const quantity = Number(line.quantity) || 0;
    if (quantity <= 0) return true;
    const parts = line.sources ?? [];
    return parts.length > 0 && parts.every((s) => s.warehouseId) && parts.reduce((t, s) => t + (Number(s.quantity) || 0), 0) === quantity;
  });
}

/** What a form keeps after the user edits a line's parts: one default-warehouse part is the same as unset. */
export function storedSources(next: WarehouseSource[], defaultWarehouseId: string): WarehouseSource[] | undefined {
  return next.length === 1 && next[0].warehouseId === defaultWarehouseId ? undefined : next;
}
