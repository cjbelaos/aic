import assert from "node:assert/strict";
import { findUsages, planReplacement } from "../../src/lib/productReplacement/classify.ts";
import { ReplacementInputError, type ReplacementSnapshot } from "../../src/lib/productReplacement/types.ts";

const today = "2026-11-28";
const now = "2026-11-28T00:00:00.000Z";

const snapshot = (): ReplacementSnapshot => ({
  products: [
    { productId: "P-OLD", productCode: "OLD-1", productName: "COPPER PIPE 1/2", status: "inactive" },
    { productId: "P-NEW", productCode: "NEW-1", productName: "COPPER PIPE HALF INCH", status: "active" },
    { productId: "P-DEAD", productCode: "DEAD-1", productName: "DEAD", status: "inactive" },
  ],
  contracts: [
    { id: "CTR-1", status: "Active", endDate: "2027-12-31", companyName: "DIVINE GRACE" },
    { id: "CTR-2", status: "Active", endDate: "2026-01-31", companyName: "OLD CLIENT" },
  ],
  contractItems: [
    { id: "CTI-1", contractId: "CTR-1", productId: "P-OLD", productCode: "OLD-1", status: "Active", rowNumber: 2 },
    { id: "CTI-2", contractId: "CTR-2", productId: "P-OLD", productCode: "OLD-1", status: "Active", rowNumber: 3 },
    { id: "CTI-3", contractId: "CTR-1", productId: "", productCode: "", status: "Active", rowNumber: 4 },
  ],
  salesOrders: [
    { salesOrderId: "SO-A", salesOrderNo: "", orderStatus: "DRAFT", version: 3, customerName: "ABC CORP" },
    { salesOrderId: "SO-B", salesOrderNo: "AIC-SO-2026-0002", orderStatus: "CONFIRMED", version: 5, customerName: "ABC CORP" },
    { salesOrderId: "SO-C", salesOrderNo: "AIC-SO-2026-0003", orderStatus: "CANCELLED", version: 2, customerName: "ABC CORP" },
  ],
  salesOrderItems: [
    { salesOrderItemId: "SOI-1", salesOrderId: "SO-A", lineNo: 1, productId: "P-OLD", lineStatus: "ACTIVE", quantity: 2, fulfilledQty: 0, cancelledQty: 0 },
    { salesOrderItemId: "SOI-2", salesOrderId: "SO-B", lineNo: 2, productId: "P-OLD", lineStatus: "ACTIVE", quantity: 3, fulfilledQty: 1, cancelledQty: 0 },
    { salesOrderItemId: "SOI-3", salesOrderId: "SO-C", lineNo: 1, productId: "P-OLD", lineStatus: "ACTIVE", quantity: 1, fulfilledQty: 0, cancelledQty: 0 },
    { salesOrderItemId: "SOI-4", salesOrderId: "SO-B", lineNo: 3, productId: "P-OLD", lineStatus: "ACTIVE", quantity: 2, fulfilledQty: 2, cancelledQty: 0 },
    { salesOrderItemId: "SOI-5", salesOrderId: "SO-A", lineNo: 2, productId: "", lineStatus: "ACTIVE", quantity: 1, fulfilledQty: 0, cancelledQty: 0 },
  ],
  purchaseRequests: [
    { prId: "PR-1", prNo: "AIC-PR-2026-0001", status: "SUBMITTED", version: 1, rowNumber: 2, customerName: "XYZ INC" },
    { prId: "PR-2", prNo: "AIC-PR-2026-0002", status: "SUBMITTED", version: 4, rowNumber: 3, customerName: "" },
  ],
  prItems: [
    { prItemId: "PRI-1", prId: "PR-1", lineNo: 1, productId: "P-OLD", productCode: "OLD-1", productName: "COPPER PIPE 1/2", quantity: 5, fromStockQty: 0, cancelledQty: 0, rowNumber: 2 },
    { prItemId: "PRI-2", prId: "PR-2", lineNo: 1, productId: "P-OLD", productCode: "OLD-1", productName: "COPPER PIPE 1/2", quantity: 5, fromStockQty: 0, cancelledQty: 0, rowNumber: 3 },
  ],
  prLinks: [{ prItemId: "PRI-2", quantity: 2 }],
  quotations: [
    { quotationNo: "Q-1", status: "SAVED", customerName: "ABC CORP" },
    { quotationNo: "Q-2", status: "SENT", customerName: "XYZ INC" },
  ],
  quotationDetails: [
    { quotationNo: "Q-1", productId: "P-OLD", productCode: "OLD-1", rowNumber: 2 },
    { quotationNo: "Q-2", productId: "P-OLD", productCode: "OLD-1", rowNumber: 3 },
  ],
  purchaseOrders: [
    { poNumber: "PO-D", status: "draft", supplierId: "S1", supplierName: "SUP ONE" },
    { poNumber: "PO-C", status: "created", supplierId: "S1", supplierName: "SUP ONE" },
  ],
  poItems: [
    { poNumber: "PO-D", itemNo: 1, productId: "P-OLD", supplierProductId: "", rowNumber: 2 },
    { poNumber: "PO-C", itemNo: 1, productId: "P-OLD", supplierProductId: "", rowNumber: 3 },
  ],
  customerPrices: [
    { id: "CPP-1", customerId: "C1", customerName: "ABC CORP", productId: "P-OLD", pricePerUnit: 120, status: "active", rowNumber: 2 },
    { id: "CPP-2", customerId: "C1", customerName: "ABC CORP", productId: "P-NEW", pricePerUnit: 115, status: "active", rowNumber: 3 },
    { id: "CPP-3", customerId: "C2", customerName: "XYZ INC", productId: "P-OLD", pricePerUnit: 99, status: "active", rowNumber: 4 },
  ],
  supplierProducts: [
    { id: "SP-1", supplierId: "S1", supplierName: "SUP ONE", productId: "P-OLD", status: "active", rowNumber: 2 },
  ],
});

// Invalid targets are rejected.
assert.throws(() => planReplacement(snapshot(), "P-OLD", "P-OLD", today, "u1", now), ReplacementInputError);
assert.throws(() => planReplacement(snapshot(), "P-OLD", "P-DEAD", today, "u1", now), ReplacementInputError);
assert.throws(() => planReplacement(snapshot(), "P-OLD", "P-MISSING", today, "u1", now), ReplacementInputError);
assert.throws(() => planReplacement(snapshot(), "P-MISSING", "P-NEW", today, "u1", now), ReplacementInputError);

const plan = planReplacement(snapshot(), "P-OLD", "P-NEW", today, "u1", now);
const ids = (list: { documentType: string; documentId: string; lineLabel: string }[]) => list.map((u) => `${u.documentType}:${u.documentId}:${u.lineLabel}`);
const edit = (sheet: string, rowNumber: number, column: string) => plan.cellEdits.find((e) => e.sheet === sheet && e.rowNumber === rowNumber && e.column === column);

// Contracts: active contract swapped, expired-by-date contract left alone, typed line ignored.
assert.ok(ids(plan.changes).some((id) => id.startsWith("contract:CTR-1")));
assert.ok(!ids([...plan.changes, ...plan.skipped]).some((id) => id.startsWith("contract:CTR-2")));
assert.equal(edit("ContractItems", 2, "C")?.newValue, "P-NEW");
assert.equal(edit("ContractItems", 2, "D")?.newValue, "NEW-1");
assert.equal(edit("ContractItems", 3, "C"), undefined);
assert.equal(edit("ContractItems", 4, "C"), undefined);

// Sales Orders: undelivered draft line swapped, partially delivered line listed, finished lines ignored.
assert.deepEqual(plan.salesOrderEdits, [{ salesOrderId: "SO-A", expectedVersion: 3, itemIds: ["SOI-1"] }]);
const partial = plan.skipped.find((u) => u.documentType === "salesOrder" && u.documentId === "SO-B");
assert.equal(partial?.reason, "partially delivered");
assert.equal(plan.skipped.filter((u) => u.documentType === "salesOrder").length, 1);
assert.ok(!ids([...plan.changes, ...plan.skipped]).some((id) => id.startsWith("salesOrder:SO-C")));

// Purchase Requests: untouched line swapped (with header version bump), line already on a PO listed.
assert.equal(edit("PurchaseRequestItems", 2, "D")?.newValue, "P-NEW");
assert.equal(edit("PurchaseRequestItems", 2, "F")?.newValue, "COPPER PIPE HALF INCH");
assert.equal(edit("PurchaseRequests", 2, "O")?.newValue, "2");
assert.equal(edit("PurchaseRequestItems", 3, "D"), undefined);
assert.ok(plan.skipped.some((u) => u.documentType === "purchaseRequest" && u.documentId === "PR-2"));

// Quotations: saved swapped, sent listed and untouched.
assert.equal(edit("QuotationDetails", 2, "B")?.newValue, "P-NEW");
assert.equal(edit("QuotationDetails", 3, "B"), undefined);
assert.equal(plan.skipped.find((u) => u.documentId === "Q-2")?.reason, "already sent to customer");

// Purchase Orders: draft swapped, created listed.
assert.equal(edit("PurchaseOrderItems", 2, "D")?.newValue, "P-NEW");
assert.equal(edit("PurchaseOrderItems", 3, "D"), undefined);
assert.equal(plan.skipped.find((u) => u.documentId === "PO-C")?.reason, "already sent to supplier");

// Customer prices: conflict deactivates the duplicate's price, a lone price moves.
assert.equal(edit("CustomerPrices", 2, "H")?.newValue, "inactive");
assert.equal(edit("CustomerPrices", 2, "C"), undefined);
assert.equal(edit("CustomerPrices", 4, "C")?.newValue, "P-NEW");
assert.equal(plan.conflicts.length, 1);
assert.equal(plan.conflicts[0].documentNo, "ABC CORP");

// Supplier products: no offering on the kept product, so it moves.
assert.equal(edit("SupplierProducts", 2, "B")?.newValue, "P-NEW");

// Old values are recorded for the audit trail.
assert.equal(edit("ContractItems", 2, "C")?.oldValue, "P-OLD");

// Draft PO line tied to a supplier offering: swapped only when the supplier offers the kept product.
{
  const s = snapshot();
  s.poItems[0].supplierProductId = "SP-1";
  // The supplier's offering moves onto the kept product in the same run, so the line keeps it.
  const moved = planReplacement(s, "P-OLD", "P-NEW", today, "u1", now);
  assert.equal(moved.cellEdits.find((e) => e.sheet === "PurchaseOrderItems" && e.rowNumber === 2 && e.column === "C")?.newValue, "SP-1");
  assert.equal(moved.cellEdits.find((e) => e.sheet === "PurchaseOrderItems" && e.rowNumber === 2 && e.column === "D")?.newValue, "P-NEW");
  // No active offering at all for the supplier: listed instead.
  s.supplierProducts[0].status = "inactive";
  const noOffer = planReplacement(s, "P-OLD", "P-NEW", today, "u1", now);
  assert.equal(noOffer.skipped.find((u) => u.documentId === "PO-D")?.reason, "supplier has no offering for the replacement");
  // Supplier already offers both: the duplicate's offering is deactivated and the line uses the kept one.
  s.supplierProducts[0].status = "active";
  s.supplierProducts.push({ id: "SP-2", supplierId: "S1", supplierName: "SUP ONE", productId: "P-NEW", status: "active", rowNumber: 3 });
  const offer = planReplacement(s, "P-OLD", "P-NEW", today, "u1", now);
  assert.equal(offer.cellEdits.find((e) => e.sheet === "PurchaseOrderItems" && e.rowNumber === 2 && e.column === "C")?.newValue, "SP-2");
  assert.equal(offer.cellEdits.find((e) => e.sheet === "SupplierProducts" && e.rowNumber === 2 && e.column === "I")?.newValue, "inactive");
}

// A printed (or any other non-draft, unfinished) PO counts as sent; completed ones are finished.
{
  const s = snapshot();
  s.purchaseOrders.push({ poNumber: "PO-P", status: "printed", supplierId: "S1", supplierName: "SUP ONE" }, { poNumber: "PO-F", status: "completed", supplierId: "S1", supplierName: "SUP ONE" });
  s.poItems.push({ poNumber: "PO-P", itemNo: 1, productId: "P-OLD", supplierProductId: "", rowNumber: 4 }, { poNumber: "PO-F", itemNo: 1, productId: "P-OLD", supplierProductId: "", rowNumber: 5 });
  const p = planReplacement(s, "P-OLD", "P-NEW", today, "u1", now);
  assert.equal(p.skipped.find((u) => u.documentId === "PO-P")?.reason, "already sent to supplier");
  assert.ok(![...p.changes, ...p.skipped].some((u) => u.documentId === "PO-F"));
}

// Bell list: only in-progress usages of inactive products, each with a link.
const usages = findUsages(snapshot(), today);
assert.ok(usages.every((u) => u.productId === "P-OLD" && u.href));
assert.ok(usages.some((u) => u.documentId === "Q-2" && u.reason === "already sent to customer"));
assert.ok(!usages.some((u) => u.documentId === "CTR-2" || u.documentId === "SO-C"));
assert.equal(usages.filter((u) => u.documentType === "salesOrder").length, 2);
assert.ok(usages.some((u) => u.documentType === "customerPrice" && u.documentNo === "XYZ INC"));

// Each usage names who it is for and links straight to the record.
{
  const byId = (id: string) => usages.find((u) => u.documentId === id);
  const contract = byId("CTR-1");
  assert.equal(contract?.partyName, "DIVINE GRACE");
  assert.equal(contract?.lineLabel, "");
  assert.equal(contract?.href, "/dashboard/customer-contracts?contract=CTR-1");
  assert.equal(byId("SO-A")?.partyName, "ABC CORP");
  assert.equal(byId("PR-1")?.partyName, "XYZ INC");
  assert.equal(byId("PR-1")?.href, "/dashboard/purchase-requests?q=AIC-PR-2026-0001");
  assert.equal(byId("Q-2")?.partyName, "XYZ INC");
  assert.equal(byId("Q-2")?.href, "/dashboard/quotations?q=Q-2");
  assert.equal(byId("PO-C")?.partyName, "SUP ONE");
  assert.equal(byId("PO-C")?.href, "/dashboard/purchase-orders?q=PO-C");
  assert.equal(byId("SP-1")?.href, "/dashboard/supplier-products?productId=P-OLD");
}

console.log("classify tests passed");
