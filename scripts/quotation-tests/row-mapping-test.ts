// Focused tests for the Quotations tab column contract (21 columns, A..U):
// complete mapping, historical rows with blank H/I, a SINGLE_TOTAL quotation
// round trip, and status / PDF metadata updates that must not touch neighbours.

import assert from "node:assert/strict";
import {
  QUOTATION_ROW,
  QUOTATION_ROW_COLUMN_COUNT,
  QUOTATION_ROW_HEADERS,
  columnLetter,
  parseQuotationPricingCells,
  parseQuotationRowValues,
  quotationAuditCells,
  quotationCellRange,
  quotationCellSpanRange,
  quotationPricingCells,
  quotationRowValues,
  quotationSheetRange,
} from "../../src/lib/quotationRow.ts";
import { singleTotalPriceFromRecord } from "../../src/lib/quotationPricing.ts";

// ── the complete 21-column mapping ──────────────────────────────────────────
assert.equal(QUOTATION_ROW_COLUMN_COUNT, 21);
assert.equal(QUOTATION_ROW_HEADERS.length, 21);
assert.equal(quotationSheetRange(), "Quotations!A2:U");
assert.equal(columnLetter(0), "A");
assert.equal(columnLetter(7), "H");
assert.equal(columnLetter(8), "I");
assert.equal(columnLetter(16), "Q");
assert.equal(columnLetter(20), "U");
assert.equal(columnLetter(26), "AA");

const expectedLayout: Array<[string, keyof typeof QUOTATION_ROW, number, string]> = [
  ["QuotationNo", "quotationNo", 0, "A"],
  ["CustomerId", "customerId", 1, "B"],
  ["Customer", "customer", 2, "C"],
  ["Description", "description", 3, "D"],
  ["Amount", "amount", 4, "E"],
  ["Discount", "discount", 5, "F"],
  ["ShippingFee", "shippingFee", 6, "G"],
  ["PricingMode", "pricingMode", 7, "H"],
  ["SingleTotalPrice", "singleTotalPrice", 8, "I"],
  ["PaymentTermId", "paymentTermId", 9, "J"],
  ["PaymentTerms", "paymentTerms", 10, "K"],
  ["File", "file", 11, "L"],
  ["Date", "date", 12, "M"],
  ["PreparedBy", "preparedBy", 13, "N"],
  ["ApprovedBy", "approvedBy", 14, "O"],
  ["SentBy", "sentBy", 15, "P"],
  ["Status", "status", 16, "Q"],
  ["CreatedBy", "createdBy", 17, "R"],
  ["CreatedAt", "createdAt", 18, "S"],
  ["UpdatedBy", "updatedBy", 19, "T"],
  ["UpdatedAt", "updatedAt", 20, "U"],
];
for (const [header, key, index, letter] of expectedLayout) {
  assert.equal(QUOTATION_ROW[key], index, `${header} must be index ${index}`);
  assert.equal(QUOTATION_ROW_HEADERS[index], header, `${letter} must be ${header}`);
  assert.equal(columnLetter(index), letter, `index ${index} must be column ${letter}`);
}
assert.equal(Object.keys(QUOTATION_ROW).length, 21);

// A full row round-trips through every column in sheet order.
const savedRow = quotationRowValues({
  quotationNo: "Q-20260925-001",
  customerId: "COMP-1",
  customer: "ACME Corp",
  description: "PORTABLE RO PARTS",
  amount: 7700,
  discount: 500,
  shippingFee: 200,
  pricingMode: "SINGLE_TOTAL",
  singleTotalPrice: 8000,
  paymentTermId: "PT-1",
  paymentTerms: "30 days",
  file: "https://drive.google.com/file/d/abc123/view",
  date: "Sep 25, 2026",
  preparedBy: "Chris",
  approvedBy: "Von",
  sentBy: "Chris",
  status: "SAVED",
  createdBy: "chris",
  createdAt: "2026-09-25T00:00:00.000Z",
  updatedBy: "chris",
  updatedAt: "2026-09-25T01:00:00.000Z",
});
assert.equal(savedRow.length, 21);
const parsedSaved = parseQuotationRowValues(savedRow);
assert.equal(parsedSaved.quotationNo, "Q-20260925-001");
assert.equal(parsedSaved.customerId, "COMP-1");
assert.equal(parsedSaved.customer, "ACME Corp");
assert.equal(parsedSaved.description, "PORTABLE RO PARTS");
assert.equal(parsedSaved.amount, 7700);
assert.equal(parsedSaved.discount, 500);
assert.equal(parsedSaved.shippingFee, 200);
assert.equal(parsedSaved.pricingMode, "SINGLE_TOTAL");
assert.equal(parsedSaved.singleTotalPrice, 8000);
assert.equal(parsedSaved.paymentTermId, "PT-1");
assert.equal(parsedSaved.paymentTerms, "30 days");
assert.equal(parsedSaved.file, "https://drive.google.com/file/d/abc123/view");
assert.equal(parsedSaved.date, "Sep 25, 2026");
assert.equal(parsedSaved.preparedBy, "Chris");
assert.equal(parsedSaved.approvedBy, "Von");
assert.equal(parsedSaved.sentBy, "Chris");
assert.equal(parsedSaved.status, "SAVED");
assert.equal(parsedSaved.createdBy, "chris");
assert.equal(parsedSaved.createdAt, "2026-09-25T00:00:00.000Z");
assert.equal(parsedSaved.updatedBy, "chris");
// ── a historical row: blank H/I must not be re-derived ───────────────────────
const historicalRow: string[] = [
  "Q-20250101-001", "COMP-9", "Legacy Customer", "LEGACY JOB", "2500", "100", "50",
  "", "",
  "PT-9", "Cash", "", "Jan 1, 2025", "Chris", "Von", "", "SENT",
  "chris", "2025-01-01T00:00:00.000Z", "chris", "2025-01-02T00:00:00.000Z",
];
assert.equal(historicalRow.length, 21);
const historical = parseQuotationRowValues(historicalRow);
assert.equal(historical.pricingMode, "PER_LINE");
assert.equal(historical.singleTotalPrice, 0);
// Stored amounts are read back exactly and never re-derived.
assert.equal(historical.amount, 2500);
assert.equal(historical.discount, 100);
assert.equal(historical.shippingFee, 50);
assert.equal(historical.paymentTermId, "PT-9");
assert.equal(historical.paymentTerms, "Cash");
assert.equal(historical.status, "SENT");
assert.equal(singleTotalPriceFromRecord({
  pricingMode: historical.pricingMode,
  singleTotalPrice: historical.singleTotalPrice,
  amount: historical.amount,
  discount: historical.discount,
  shippingFee: historical.shippingFee,
}), 0);
assert.deepEqual(parseQuotationPricingCells(historicalRow), ["PER_LINE", 0]);

// A truncated legacy row (fewer cells than the current layout) stays safe.
const truncated = parseQuotationRowValues(["Q-OLD", "COMP-9", "Legacy"]);
assert.equal(truncated.pricingMode, "PER_LINE");
assert.equal(truncated.singleTotalPrice, 0);
assert.equal(truncated.amount, 0);
assert.equal(truncated.status, "DRAFT");

// ── saving and reopening a SINGLE_TOTAL quotation ────────────────────────────
const singleRow = quotationRowValues({
  ...quotationAuditCells("chris", "2026-09-25T02:00:00.000Z"),
  quotationNo: "Q-20260925-009",
  customerId: "COMP-2",
  customer: "Beta Corp",
  description: "ONE PRICE JOB",
  amount: 4900,
  discount: 200,
  shippingFee: 100,
  pricingMode: "SINGLE_TOTAL",
  singleTotalPrice: 5000,
  paymentTermId: "PT-2",
  paymentTerms: "15 days",
  file: "",
  date: "Sep 25, 2026",
  preparedBy: "Chris",
  approvedBy: "Von",
  sentBy: "",
  status: "DRAFT",
});
assert.equal(singleRow[7], "SINGLE_TOTAL");
assert.equal(singleRow[8], 5000);
assert.equal(singleRow[9], "PT-2");
const reopened = parseQuotationRowValues(singleRow);
assert.equal(reopened.pricingMode, "SINGLE_TOTAL");
assert.equal(reopened.singleTotalPrice, 5000);
assert.equal(reopened.amount, 4900);
assert.equal(reopened.discount, 200);
assert.equal(reopened.shippingFee, 100);
assert.equal(reopened.createdBy, "chris");
assert.equal(reopened.updatedBy, "chris");

// ── status / PDF metadata updates touch only their own columns ──────────────
assert.equal(quotationCellRange(5, "status"), "Quotations!Q5");
assert.equal(quotationCellSpanRange(5, "updatedBy", "updatedAt"), "Quotations!T5:U5");
assert.equal(quotationCellRange(5, "file"), "Quotations!L5");
assert.equal(quotationCellRange(5, "pricingMode"), "Quotations!H5");
assert.equal(quotationCellRange(5, "singleTotalPrice"), "Quotations!I5");

/** Simulates a Sheets cell-range write on a copy of the row. */
function writeCells(row: readonly unknown[], columnKey: keyof typeof QUOTATION_ROW, values: unknown[]): unknown[] {
  const next = [...row];
  values.forEach((value, offset) => { next[QUOTATION_ROW[columnKey] + offset] = value; });
  return next;
}

const statusUpdated = writeCells(singleRow, "status", ["SENT"]);
assert.equal(statusUpdated[QUOTATION_ROW.status], "SENT");
for (let index = 0; index < 21; index += 1) {
  if (index === QUOTATION_ROW.status) continue;
  assert.deepEqual(statusUpdated[index], singleRow[index], `status update changed column ${columnLetter(index)}`);
}

const auditUpdated = writeCells(statusUpdated, "updatedBy", ["approver", "2026-09-26T00:00:00.000Z"]);
assert.equal(auditUpdated[QUOTATION_ROW.updatedBy], "approver");
assert.equal(auditUpdated[QUOTATION_ROW.updatedAt], "2026-09-26T00:00:00.000Z");
// Creation identity (R/S) and H/I survive untouched.
assert.equal(auditUpdated[QUOTATION_ROW.createdBy], "chris");
assert.equal(auditUpdated[QUOTATION_ROW.createdAt], "2026-09-25T02:00:00.000Z");
assert.equal(auditUpdated[QUOTATION_ROW.pricingMode], "SINGLE_TOTAL");
assert.equal(auditUpdated[QUOTATION_ROW.singleTotalPrice], 5000);
assert.equal(auditUpdated[QUOTATION_ROW.amount], 4900);

const fileUpdated = writeCells(auditUpdated, "file", ["https://drive.google.com/file/d/newpdf/view"]);
assert.equal(parseQuotationRowValues(fileUpdated).file, "https://drive.google.com/file/d/newpdf/view");
assert.equal(fileUpdated[QUOTATION_ROW.paymentTermId], "PT-2");
assert.equal(fileUpdated[QUOTATION_ROW.paymentTerms], "15 days");
assert.equal(parseQuotationRowValues(fileUpdated).status, "SENT");
assert.equal(parseQuotationRowValues(fileUpdated).amount, 4900);

// ── a write that omits the pricing pair must keep the stored H/I values ─────
const rebuilt = quotationRowValues({
  ...parseQuotationRowValues(fileUpdated),
  pricingMode: parseQuotationPricingCells(fileUpdated)[0],
  singleTotalPrice: quotationPricingCells("SINGLE_TOTAL", 5000)[1],
});
assert.equal(rebuilt[QUOTATION_ROW.pricingMode], "SINGLE_TOTAL");
assert.equal(rebuilt[QUOTATION_ROW.singleTotalPrice], 5000);
assert.deepEqual(quotationPricingCells(undefined, undefined), ["PER_LINE", 0]);

// ── audit cells ────────────────────────────────────────────────────────────
const created = quotationAuditCells("chris", "2026-09-25T03:00:00.000Z");
assert.deepEqual(created, {
  createdBy: "chris", createdAt: "2026-09-25T03:00:00.000Z",
  updatedBy: "chris", updatedAt: "2026-09-25T03:00:00.000Z",
});
const preserved = quotationAuditCells("approver", "2026-09-26T00:00:00.000Z", historicalRow);
assert.equal(preserved.createdBy, "chris");
assert.equal(preserved.createdAt, "2025-01-01T00:00:00.000Z");
assert.equal(preserved.updatedBy, "approver");
assert.equal(preserved.updatedAt, "2026-09-26T00:00:00.000Z");

console.log("Quotation row mapping tests passed.");
