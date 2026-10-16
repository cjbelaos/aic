import type { ProformaInvoice } from "@/types/proformaInvoice";
import type { SalesOrder } from "@/types/salesOrder";
import { proformaNumber } from "./domain";
const text = (value: unknown) => String(value ?? "").trim();
function legacyDate(value: unknown): string {
  if (typeof value === "number") return new Date(Date.UTC(1899, 11, 30) + value * 86400000).toISOString().slice(0, 10);
  const parsed = Date.parse(text(value));
  return Number.isFinite(parsed) ? new Date(parsed).toISOString().slice(0, 10) : "";
}
export function buildProformaMigration(rows: unknown[][], orders: SalesOrder[], existing: ProformaInvoice[], timestamp: string) {
  const imports: ProformaInvoice[] = [];
  const skipped: Array<{ row: number; reason: string }> = [];
  const issues: Array<{ row: number; issue: string }> = [];
  const seenNumbers = new Set(existing.map(invoice => invoice.invoiceNo));
  rows.slice(1).forEach((row, index) => {
    const sourceRow = index + 2;
    const match = /^PFI-(\d+)$/i.exec(text(row[2]));
    if (!match) { if (row.some(value => text(value))) skipped.push({ row: sourceRow, reason: "Not a PFI record" }); return; }
    const id = `legacy-pfi-1156547389-row-${sourceRow}`;
    if (existing.some(invoice => invoice.id === id)) { skipped.push({ row: sourceRow, reason: "Already imported" }); return; }
    const amount = typeof row[7] === "number" ? row[7] : Number(text(row[7]).replace(/[^\d.-]/g, ""));
    if (!text(row[3]) && !text(row[6]) && !amount) { skipped.push({ row: sourceRow, reason: "Empty number placeholder" }); return; }
    const trNo = text(row[0]);
    const sequence = Number(match[1]) === 12 && trNo === "1192" ? 14 : Number(match[1]);
    const invoiceNo = proformaNumber(sequence);
    if (seenNumbers.has(invoiceNo)) throw new Error(`Duplicate migrated number ${invoiceNo} at source row ${sourceRow}.`);
    seenNumbers.add(invoiceNo);
    const candidates = orders.filter(order => order.legacyTrackerNo === trNo && trNo !== "");
    const order = candidates.length === 1 ? candidates[0] : undefined;
    const invoiceIssues = ["LEGACY_AGGREGATE: Original combined description and amount retained; no line quantities/prices were available."];
    if (!order) invoiceIssues.push("REVIEW: Sales Order reference could not be matched uniquely.");
    if (!legacyDate(row[1])) invoiceIssues.push("REVIEW: Invoice date is missing or invalid.");
    if (!Number.isFinite(amount) || amount <= 0) invoiceIssues.push("REVIEW: Legacy total is missing or invalid.");
    if (sequence !== Number(match[1])) invoiceIssues.push("Original PFI-012 (TR 1192) renumbered to PFI-014 in migration only.");
    if (invoiceIssues.some(issue => issue.startsWith("REVIEW"))) issues.push({ row: sourceRow, issue: invoiceIssues.join(" ") });
    const totalAmount = Number.isFinite(amount) ? amount : 0;
    const description = text(row[6]) || "Legacy proforma (description unavailable)";
    imports.push({
      id, invoiceNo, sourceInvoiceNo: text(row[2]), status: "ISSUED", salesOrderId: order?.salesOrderId || "", salesOrderNo: order?.salesOrderNo || "", trNo,
      date: legacyDate(row[1]), customerId: order?.customerId || "", companyName: text(row[3]), tin: text(row[4]), address: text(row[5]), poNo: order?.customerPONo || "", drNo: "",
      notes: (description.match(/\b\d+\s*%\s*(?:DP|FP)\b/i)?.[0] || ""), remarks: text(row[16]), preparedBy: "",
      items: [{ salesOrderItemId: "", productName: description, unit: "", quantity: 1, unitPrice: totalAmount, discountAmount: 0, amount: totalAmount }], totalAmount,
      pdfLink: "", scanLink: "", version: 1, sourceRow, importIssue: invoiceIssues.join(" "), createdAt: timestamp, createdBy: "migration", updatedAt: timestamp, updatedBy: "migration",
    });
  });
  return { imports, skipped, issues };
}
