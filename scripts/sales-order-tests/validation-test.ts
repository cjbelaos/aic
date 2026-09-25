import assert from "node:assert/strict";
import { SalesOrderError } from "../../src/lib/salesOrders/errors.ts";
import { parseCancelOrderInput, parseCreateOrderInput, parseDocumentInput, parseExpectedVersion, parseFulfillmentInput, parseRetrySyncInput, parseUpdateOrderInput } from "../../src/lib/salesOrders/validation.ts";

function expect400(fn: () => void, messagePattern: RegExp): SalesOrderError {
  let caught: SalesOrderError | null = null;
  try { fn(); } catch (error) {
    caught = error instanceof SalesOrderError ? error : null;
  }
  assert.ok(caught, "expected a SalesOrderError (400)");
  assert.equal(caught.status, 400);
  const combined = `${caught.message} ${JSON.stringify(caught.fieldErrors ?? {})}`;
  assert.match(combined, messagePattern, `expected error mentioning ${messagePattern}`);
  return caught;
}

const uuid = "33333333-3333-4333-8333-333333333333";

// Create: commandId must be a UUID; lines must validate.
const base = {
  commandId: uuid,
  customerId: "COMP-1",
  receivedDate: "2026-09-19",
  lines: [{ lineType: "PRODUCT", productId: "PRD-1", description: "Part", unitId: "pc", quantity: 2, unitPrice: 100 }],
};
const created = parseCreateOrderInput(base);
assert.equal(created.currency, "PHP");
assert.equal(created.lines[0].lineType, "PRODUCT");
assert.equal(created.lines[0].taxMode, "VAT_INCLUSIVE");
expect400(() => parseCreateOrderInput({ ...base, commandId: "not-a-uuid" }), /commandId/);
expect400(() => parseCreateOrderInput({ ...base, customerId: "" }), /customerId/);
expect400(() => parseCreateOrderInput({ ...base, lines: [{ lineType: "PRODUCT", quantity: -1 }] }), /lines\.0/);

// Blank quantity/price are allowed in drafts (unknown, never zero) but negative is not.
const draftLine = parseCreateOrderInput({ ...base, lines: [{ lineType: "SERVICE", description: "Labor", unitId: "hr", quantity: null, unitPrice: null }] });
assert.equal(draftLine.lines[0].quantity, null);
assert.equal(draftLine.lines[0].unitPrice, null);

// Leading-zero PO text survives untouched.
const withPo = parseCreateOrderInput({ ...base, customerPONo: "00042" });
assert.equal(withPo.customerPONo, "00042");

// Quotation reference: selecting an existing quotation is still the default.
const withInternalQuotation = parseCreateOrderInput({ ...base, quotationSource: "INTERNAL", sourceQuotationNo: "QT-001" });
assert.equal(withInternalQuotation.sourceQuotationNo, "QT-001");
assert.equal(withInternalQuotation.quotationSource, "INTERNAL");
// An external quotation number is saved as the order's reference without an internal record.
const withExternalQuotation = parseCreateOrderInput({ ...base, quotationSource: "EXTERNAL", externalQuotationNo: "  EXT-8891 " });
assert.equal(withExternalQuotation.sourceQuotationNo, "EXT-8891");
assert.equal(withExternalQuotation.externalQuotationNo, "EXT-8891");
assert.equal(withExternalQuotation.quotationSource, "EXTERNAL");
// An external number must not be blank, and the mode must be known.
expect400(() => parseCreateOrderInput({ ...base, quotationSource: "EXTERNAL", externalQuotationNo: "   " }), /external quotation number/i);
expect400(() => parseCreateOrderInput({ ...base, quotationSource: "SURPRISE" }), /INTERNAL or EXTERNAL/);
// Legacy payloads (no quotationSource) are unchanged.
assert.equal(parseCreateOrderInput({ ...base, sourceQuotationNo: "QT-9" }).sourceQuotationNo, "QT-9");
assert.equal(parseCreateOrderInput({ ...base, sourceQuotationNo: "QT-9" }).quotationSource, "");

// Update: expectedVersion is required and integer non-negative.
const update = parseUpdateOrderInput({ commandId: uuid, expectedVersion: 1, requiredDate: "2026-10-01", lines: base.lines });
assert.equal(update.expectedVersion, 1);
assert.equal(update.requiredDate, "2026-10-01");
expect400(() => parseUpdateOrderInput({ commandId: uuid, requiredDate: "2026-10-01" }), /expectedVersion/);
expect400(() => parseUpdateOrderInput({ commandId: uuid, expectedVersion: 1.5 }), /must be an integer/);

// Confirm: version envelope only.
assert.equal(parseExpectedVersion({ commandId: uuid, expectedVersion: 2 }).expectedVersion, 2);
expect400(() => parseExpectedVersion({ commandId: uuid }), /expectedVersion/);

// Cancel: reason required.
const cancel = parseCancelOrderInput({ commandId: uuid, expectedVersion: 2, reason: "Customer cancelled" });
assert.equal(cancel.cancelAllLines, true);
expect400(() => parseCancelOrderInput({ commandId: uuid, expectedVersion: 2, reason: " " }), /reason/);

// Fulfillment: at least one valid entry; reversal/type validation.
const fulfilment = parseFulfillmentInput({
  commandId: uuid,
  expectedVersion: 2,
  entries: [{ salesOrderItemId: uuid, type: "DELIVERY", quantity: 2, effectiveDate: "2026-09-19", sourceDocumentType: "DELIVERY_RECEIPT", sourceDocumentId: "DR-1", sourceLineId: "L1" }],
});
assert.equal(fulfilment.entries[0].type, "DELIVERY");
expect400(() => parseFulfillmentInput({ commandId: uuid, expectedVersion: 2, entries: [] }), /At least one/);
expect400(() => parseFulfillmentInput({ commandId: uuid, expectedVersion: 2, entries: [{ salesOrderItemId: uuid, type: "SURPRISE", quantity: 1, effectiveDate: "2026-09-19" }] }), /type must be/);
expect400(() => parseFulfillmentInput({ commandId: uuid, expectedVersion: 2, entries: [{ salesOrderItemId: uuid, type: "DELIVERY", quantity: 1, effectiveDate: "2026-09-19", sourceDocumentId: "DR-1", sourceLineId: "L1" }] }), /DELIVERY_RECEIPT/);
expect400(() => parseFulfillmentInput({ commandId: uuid, expectedVersion: 2, entries: [{ salesOrderItemId: uuid, type: "SERVICE_COMPLETION", quantity: 1, effectiveDate: "2026-09-19", sourceDocumentType: "SERVICE_INVOICE", sourceDocumentId: "SI-1", sourceLineId: "L1" }] }), /SERVICE_REPORT/);

// Documents: URL scheme is validated; Drive IDs are accepted without a URL.
assert.equal(parseDocumentInput({ commandId: uuid, documentType: "CUSTOMER_PO", externalUrl: "https://drive.google.com/file/d/abc/view", fileName: "po.pdf", mimeType: "application/pdf" }).externalUrl, "https://drive.google.com/file/d/abc/view");
assert.equal(parseDocumentInput({ commandId: uuid, documentType: "OTHER", driveFileId: "FILE-123" }).driveFileId, "FILE-123");
expect400(() => parseDocumentInput({ commandId: uuid, documentType: "OTHER" }), /Provide an externalUrl or a driveFileId/);
expect400(() => parseDocumentInput({ commandId: uuid, documentType: "OTHER", externalUrl: "javascript:alert(1)" }), /http\(s\)/);

// Sync retry: commandId must be a UUID.
assert.equal(parseRetrySyncInput({ commandId: uuid }).commandId, uuid);

console.log("validation-test passed: runtime request safety, UUID commands, unknown-blank preservation, PO leading zeros, field errors.");
