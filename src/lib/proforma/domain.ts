import { roundCurrency } from "@/lib/discounts";
import type { SalesOrder, SalesOrderItem } from "@/types/salesOrder";
import type { ProformaInvoice, ProformaItem } from "@/types/proformaInvoice";

export class ProformaError extends Error {
  constructor(message: string, public status = 400) { super(message); }
}
export function proformaNumber(sequence: number): string {
  if (!Number.isSafeInteger(sequence) || sequence < 1 || sequence > 999999) throw new ProformaError("Invalid proforma sequence.");
  const digits = String(sequence).padStart(6, "0");
  return `AIC-PFI-${digits.slice(0, 3)}-${digits.slice(3)}`;
}
export function sourceNumber(sequence: number): string { return `PFI-${String(sequence).padStart(3, "0")}`; }
export function sequenceOf(value: string): number {
  const match = /^AIC-PFI-(\d{3})-(\d{3})$/.exec(value);
  return match ? Number(match[1] + match[2]) : 0;
}
export function availableOrderItems(items: readonly SalesOrderItem[]): SalesOrderItem[] {
  return items.filter(item => item.lineStatus === "ACTIVE" && (item.quantity ?? 0) > item.cancelledQty && !item.quotationLineReference.endsWith(":SHIPPING"));
}
export function defaultProformaItems(items: readonly SalesOrderItem[]): ProformaItem[] {
  return availableOrderItems(items).map(item => ({
    salesOrderItemId: item.salesOrderItemId,
    productName: item.productNameSnapshot || item.description,
    unit: item.unitSnapshot,
    quantity: (item.quantity ?? 0) - item.cancelledQty,
    unitPrice: roundCurrency((item.unitPrice ?? 0) * (item.taxMode === "VAT_EXCLUSIVE" ? 1 + item.taxRate : 1)),
    discountAmount: 0, amount: 0,
  }));
}
/** Only explicit order-line links inherit discounts. Manual additions have none. */
export function priceProformaItems(raw: unknown, orderItems: readonly SalesOrderItem[]): ProformaItem[] {
  if (!Array.isArray(raw) || !raw.length || raw.length > 200) throw new ProformaError("Enter between 1 and 200 line items.");
  const available = availableOrderItems(orderItems);
  return raw.map(value => {
    if (!value || typeof value !== "object") throw new ProformaError("Invalid line item.");
    const input = value as Record<string, unknown>;
    const productName = String(input.productName ?? "").trim();
    const quantity = Number(input.quantity), unitPrice = roundCurrency(Number(input.unitPrice));
    if (!productName || productName.length > 2000 || input.quantity === "" || input.unitPrice === "" || input.quantity == null || input.unitPrice == null || !Number.isFinite(quantity) || !Number.isFinite(unitPrice) || quantity <= 0 || unitPrice < 0 || quantity > 1e8 || unitPrice > 1e10) throw new ProformaError("Each item needs a product name, positive quantity and non-negative unit price.");
    const salesOrderItemId = String(input.salesOrderItemId ?? "");
    const source = salesOrderItemId ? available.find(line => line.salesOrderItemId === salesOrderItemId) : undefined;
    if (salesOrderItemId && !source) throw new ProformaError("A linked item is no longer available on this Sales Order.");
    const gross = roundCurrency(quantity * unitPrice);
    const multiplier = source?.taxMode === "VAT_EXCLUSIVE" ? 1 + source.taxRate : 1;
    const sourceGross = source ? (source.quantity ?? 0) * (source.unitPrice ?? 0) * multiplier : 0;
    const discountAmount = source && sourceGross > 0 ? roundCurrency(source.discountAmount * multiplier * gross / sourceGross) : 0;
    if (discountAmount > gross) throw new ProformaError("Discount exceeds the line amount.");
    return { salesOrderItemId, productName, unit: String(input.unit ?? "").trim().slice(0, 50), quantity, unitPrice: roundCurrency(unitPrice), discountAmount, amount: roundCurrency(gross - discountAmount) };
  });
}
export function assertWithinOrderTotal(order: SalesOrder, invoice: ProformaInvoice, all: readonly ProformaInvoice[]): void {
  const used = all.filter(other => other.id !== invoice.id && other.salesOrderId === order.salesOrderId && other.status === "ISSUED").reduce((sum, other) => sum + Math.round(other.totalAmount * 100), 0);
  if (used + Math.round(invoice.totalAmount * 100) > Math.round(order.grandTotal * 100)) throw new ProformaError(`Issued proformas would exceed the Sales Order total. Available amount: ${((Math.round(order.grandTotal * 100) - used) / 100).toFixed(2)}.`);
}
