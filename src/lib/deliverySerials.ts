// Delivery Receipt serial numbers and warranty rules.
//
// Pure helpers shared by the Sheets layer, the API routes and the Delivery Release
// page. Keep this module free of "@/" imports so the focused tests can compile it.

import { addYears, format, startOfDay } from "date-fns";
import type { DeliveryItem } from "../types/deliveryReceipt.ts";

/** Splits typed serials on commas or new lines; trims, drops blanks, dedupes (case-insensitive). */
export function parseSerialInput(text: string): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const part of String(text ?? "").split(/[,\r\n]+/)) {
    const serial = part.trim();
    const key = serial.toLowerCase();
    if (!serial || seen.has(key)) continue;
    seen.add(key);
    result.push(serial);
  }
  return result;
}

/** Sheet cell format for a line's serials. */
export function formatSerialCell(serials: readonly string[]): string {
  return serials.join(", ");
}

export function parseSerialCell(cell: unknown): string[] {
  return parseSerialInput(cell == null ? "" : String(cell));
}

/** Parses a DR date stored as `YYYY-MM-DD` or Sheets-formatted `M/D/YYYY` into local midnight. */
export function parseDeliveryDate(raw: string): Date | null {
  const value = String(raw ?? "").trim();
  let y: number, m: number, d: number;
  let match = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(value);
  if (match) {
    [y, m, d] = [Number(match[1]), Number(match[2]), Number(match[3])];
  } else if ((match = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(value))) {
    [m, d, y] = [Number(match[1]), Number(match[2]), Number(match[3])];
  } else {
    return null;
  }
  const date = new Date(y, m - 1, d);
  if (date.getFullYear() !== y || date.getMonth() !== m - 1 || date.getDate() !== d) return null;
  return date;
}

export function warrantyEnd(deliveryDate: Date): Date {
  return addYears(deliveryDate, 1);
}

export type WarrantyStatus = { state: "active" | "expired"; endDate: Date; label: string };

const NO_WARRANTY_STATUSES = new Set(["draft", "cancelled", "deleted"]);

/** Warranty for a delivered line: only lines with serials on live DRs with a readable date. */
export function warrantyStatus(
  input: { date: string; status: string; serialCount: number },
  today: Date,
): WarrantyStatus | null {
  if (input.serialCount < 1) return null;
  if (NO_WARRANTY_STATUSES.has(String(input.status ?? "").trim().toLowerCase())) return null;
  const delivered = parseDeliveryDate(input.date);
  if (!delivered) return null;
  const endDate = warrantyEnd(delivered);
  const shown = format(endDate, "MMM d, yyyy");
  return startOfDay(today) <= endDate
    ? { state: "active", endDate, label: `Under warranty until ${shown}` }
    : { state: "expired", endDate, label: `Warranty expired ${shown}` };
}

export function serialShortfall(input: {
  requiresSerial: boolean;
  quantity: number;
  serialCount: number;
}): { missing: number; label: string } | null {
  if (!input.requiresSerial) return null;
  const missing = input.quantity - input.serialCount;
  if (missing <= 0) return null;
  return { missing, label: `Serial missing (${missing} of ${input.quantity})` };
}

/** Every word of the query must appear somewhere in the fields. */
export function matchesDeliverySearch(query: string, fields: readonly unknown[]): boolean {
  const tokens = String(query ?? "").toLowerCase().split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return true;
  const haystack = fields.map((field) => String(field ?? "").toLowerCase());
  return tokens.every((token) => haystack.some((field) => field.includes(token)));
}

/** DR print template rows (qty, unit, description), with an `S/N:` row after items that have serials. */
export function deliveryPrintRows(
  items: readonly { quantity: number; unit: string; description: string; serialNumbers?: string[] }[],
): (string | number)[][] {
  return items.flatMap((item) => {
    const row: (string | number)[] = [item.quantity, item.unit, item.description];
    const serials = cleanSerialList(item.serialNumbers);
    return serials.length ? [row, ["", "", `S/N: ${formatSerialCell(serials)}`]] : [row];
  });
}

/** Maps a `DeliveryReceiptItems` row (A:K) to a DR line. Legacy rows without K read as no serials. */
export function parseDeliveryItemRow(row: readonly unknown[]): { drNumber: number; status: string; item: DeliveryItem } {
  const text = (index: number) => String(row[index] ?? "").trim();
  return {
    drNumber: Number(row[0]),
    status: text(7) || "active",
    item: {
      deliveryReceiptItemId: text(8) || undefined,
      salesOrderItemId: text(9) || undefined,
      productId: text(2) || undefined,
      productCode: String(row[3] ?? ""),
      description: String(row[4] ?? ""),
      quantity: Number(row[5]) || 0,
      unit: String(row[6] ?? ""),
      serialNumbers: parseSerialCell(row[10]),
    },
  };
}

/** Builds the `DeliveryReceiptItems` row (A:K) for a DR line. */
export function deliveryItemRowValues(drNumber: number, index: number, item: DeliveryItem): (string | number)[] {
  return [
    drNumber,
    index + 1,
    item.productId ?? "",
    item.productCode,
    item.description,
    item.quantity,
    item.unit,
    "active",
    item.deliveryReceiptItemId ?? globalThis.crypto.randomUUID(),
    item.salesOrderItemId ?? "",
    serialCellValue(cleanSerialList(item.serialNumbers)),
  ];
}

/** Value to write for a serial cell under USER_ENTERED: a leading apostrophe keeps it as text. */
export function serialCellValue(serials: readonly string[]): string {
  return serials.length ? `'${formatSerialCell(serials)}` : "";
}

/** Normalizes a serial list that may come from an untrusted request body. */
export function cleanSerialList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return parseSerialInput(value.filter((entry) => typeof entry === "string").join("\n"));
}
