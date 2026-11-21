import assert from "node:assert/strict";
import { productPickerLabels, validateDraftLine, validatePoLinks } from "../../src/lib/purchaseRequests/domain.ts";
import type { PrRequestType, PurchaseRequest, PurchaseRequestItem } from "../../src/types/purchaseRequest.ts";

// ── draft line validation by request type ──
const ctx = (requestType: PrRequestType) => ({ requestType, soItemIds: new Set(["SOI1"]), contractItemIds: new Set(["CTI1"]) });
assert.equal(validateDraftLine({ productId: "P1", quantity: 1 }, 0, ctx("NONE")), null);
assert.equal(validateDraftLine({ description: "Teflon tape", unit: "roll", quantity: 2 }, 0, ctx("NONE")), null);
assert.match(validateDraftLine({ description: "   ", quantity: 1 }, 0, ctx("NONE"))!, /Line 1: choose a product or type a description/);
assert.match(validateDraftLine({ productId: "P1", quantity: 0 }, 1, ctx("NONE"))!, /Line 2: quantity must be more than zero/);
assert.equal(validateDraftLine({ productId: "P1", quantity: 1, salesOrderItemId: "SOI1" }, 0, ctx("SALES_ORDER")), null);
assert.match(validateDraftLine({ productId: "P1", quantity: 1, salesOrderItemId: "SOI9" }, 0, ctx("SALES_ORDER"))!, /sales order line it is for was not found/);
assert.match(validateDraftLine({ productId: "P1", quantity: 1, salesOrderItemId: "SOI1" }, 0, ctx("CONTRACT"))!, /only on sales order requests/);
assert.equal(validateDraftLine({ productId: "P1", quantity: 1, contractItemId: "CTI1" }, 0, ctx("CONTRACT")), null);
assert.match(validateDraftLine({ productId: "P1", quantity: 1, contractItemId: "CTI9" }, 0, ctx("CONTRACT"))!, /contract item was not found on this contract/);
assert.match(validateDraftLine({ productId: "P1", quantity: 1, contractItemId: "CTI1" }, 0, ctx("NONE"))!, /only on contract requests/);

// ── typed PR line ↔ description-only PO line ──
const typed: PurchaseRequestItem = {
  prItemId: "PRI000009", prId: "PR000001", lineNo: 1, productId: "", productCodeSnapshot: "", productNameSnapshot: "Teflon tape",
  unitId: "", unitSnapshot: "roll", quantity: 5, salesOrderItemId: "", contractItemId: "", remarks: "", fromStockQty: 0, fromStockNote: "",
  fromStockBy: "", fromStockAt: "", cancelledQty: 0, cancelReason: "", cancelledBy: "", cancelledAt: "", createdAt: "", createdBy: "", updatedAt: "", updatedBy: "",
};
const openPr: PurchaseRequest = {
  prId: "PR000001", prNo: "AIC-PR-2026-0001", status: "SUBMITTED", requestType: "NONE", salesOrderId: "", salesOrderNoSnapshot: "",
  customerNameSnapshot: "", quotationNoSnapshot: "", deliveryAddressSnapshot: "", requestedByUserId: "u1", requestedByName: "Tech",
  requestedDate: "2026-11-21", neededByDate: "", purpose: "", cancelReason: "", version: 1, createdAt: "", createdBy: "", updatedAt: "", updatedBy: "",
  contractId: "", contractNoSnapshot: "",
};
const base = { poNumber: "PO-X", prItems: [typed], prs: [openPr], allLinks: [], poStatus: new Map<string, string>() };
assert.deepEqual(validatePoLinks({ ...base, items: [{ itemNo: 1, quantity: 5, prLinks: [{ prItemId: "PRI000009", quantity: 5 }] }] }), []);
assert.deepEqual(validatePoLinks({ ...base, items: [{ itemNo: 1, productId: "", quantity: 5, prLinks: [{ prItemId: "PRI000009", quantity: 5 }] }] }), []);
assert.match(validatePoLinks({ ...base, items: [{ itemNo: 1, productId: "P1", quantity: 5, prLinks: [{ prItemId: "PRI000009", quantity: 5 }] }] })[0], /product does not match/);
// product PR line still needs the same product
assert.match(validatePoLinks({ ...base, prItems: [{ ...typed, productId: "P1" }], items: [{ itemNo: 1, quantity: 5, prLinks: [{ prItemId: "PRI000009", quantity: 5 }] }] })[0], /product does not match/);

// ── picker labels: code only for duplicate names ──
const labels = productPickerLabels([
  { productId: "A", productCode: "F-01", productName: "Filter" },
  { productId: "B", productCode: "F-02", productName: "filter " },
  { productId: "C", productCode: "S-01", productName: "Salt 50kg" },
]);
assert.equal(labels.get("A"), "Filter (F-01)");
assert.equal(labels.get("B"), "filter (F-02)");
assert.equal(labels.get("C"), "Salt 50kg");
