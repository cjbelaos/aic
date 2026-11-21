import assert from "node:assert/strict";
import {
  deriveLineProgress,
  derivePrStatus,
  formatPrNo,
  isPrLocked,
  nextPrNo,
  validateCancelRemaining,
  validateFromStock,
  validatePoLinks,
} from "../../src/lib/purchaseRequests/domain.ts";
import type { PrLineProgress, PurchaseRequest, PurchaseRequestItem, PurchaseRequestLink } from "../../src/types/purchaseRequest.ts";

// ── numbering ──
assert.equal(formatPrNo("2026", 1), "AIC-PR-2026-0001");
assert.equal(nextPrNo(["AIC-PR-2026-0007", "AIC-PR-2025-0099", ""], "2026-11-21"), "AIC-PR-2026-0008");
assert.equal(nextPrNo([], "2027-01-02"), "AIC-PR-2027-0001");

// ── fixtures ──
function item(overrides: Partial<PurchaseRequestItem> = {}): PurchaseRequestItem {
  return {
    prItemId: "PRI000001", prId: "PR000001", lineNo: 1, productId: "P1", productCodeSnapshot: "C1",
    productNameSnapshot: "Filter", unitId: "U1", unitSnapshot: "pc", quantity: 10, salesOrderItemId: "",
    remarks: "", fromStockQty: 0, fromStockNote: "", fromStockBy: "", fromStockAt: "", cancelledQty: 0,
    cancelReason: "", cancelledBy: "", cancelledAt: "", createdAt: "", createdBy: "", updatedAt: "", updatedBy: "",
    ...overrides,
  };
}
function link(poNumber: string, quantity: number, prItemId = "PRI000001", prId = "PR000001", poItemNo = 1): PurchaseRequestLink {
  return { linkId: `L-${poNumber}-${prItemId}`, poNumber, poItemNo, prId, prItemId, quantity, createdAt: "", createdBy: "" };
}
function pr(overrides: Partial<PurchaseRequest> = {}): PurchaseRequest {
  return {
    prId: "PR000001", prNo: "AIC-PR-2026-0001", status: "SUBMITTED", salesOrderId: "SO1", salesOrderNoSnapshot: "AIC-SO-2026-0001",
    customerNameSnapshot: "", quotationNoSnapshot: "", deliveryAddressSnapshot: "", requestedByUserId: "u1", requestedByName: "Tech",
    requestedDate: "2026-11-21", neededByDate: "", purpose: "", cancelReason: "", version: 1, createdAt: "", createdBy: "", updatedAt: "", updatedBy: "",
    ...overrides,
  };
}
const statuses = new Map([["PO-A", "created"], ["PO-B", "draft"], ["PO-C", "cancelled"], ["PO-D", "deleted"], ["PO-E", "approved"]]);

// ── progress ──
{
  const p = deriveLineProgress(item({ fromStockQty: 1 }), [link("PO-A", 4), link("PO-B", 3), link("PO-C", 5), link("PO-D", 2)], statuses);
  assert.deepEqual(p, { prItemId: "PRI000001", quantity: 10, orderedQty: 4, onDraftQty: 3, fromStockQty: 1, cancelledQty: 0, remaining: 5, claimable: 2, poNumbers: ["PO-A"] });
}
{
  const p = deriveLineProgress(item({ quantity: 2, fromStockQty: 1 }), [link("PO-A", 2)], statuses);
  assert.equal(p.remaining, 0);
  assert.equal(p.claimable, 0);
}
{
  // links for other lines and links on unknown POs are ignored
  const p = deriveLineProgress(item(), [link("PO-A", 1, "PRI000009"), link("PO-ZZ", 4)], statuses);
  assert.equal(p.orderedQty, 0);
  assert.equal(p.onDraftQty, 0);
  assert.equal(p.claimable, 10);
}

// ── status ──
const progress = (o: Partial<PrLineProgress>): PrLineProgress => ({ prItemId: "x", quantity: 5, orderedQty: 0, onDraftQty: 0, fromStockQty: 0, cancelledQty: 0, remaining: 5, claimable: 5, poNumbers: [], ...o });
assert.equal(derivePrStatus({ status: "DRAFT" }, [progress({})]), "DRAFT");
assert.equal(derivePrStatus({ status: "CANCELLED" }, [progress({})]), "CANCELLED");
assert.equal(derivePrStatus({ status: "SUBMITTED" }, [progress({})]), "OPEN");
assert.equal(derivePrStatus({ status: "SUBMITTED" }, [progress({ onDraftQty: 5, claimable: 0 })]), "OPEN");
assert.equal(derivePrStatus({ status: "SUBMITTED" }, [progress({ orderedQty: 2, remaining: 3, claimable: 3 })]), "PARTIAL");
assert.equal(derivePrStatus({ status: "SUBMITTED" }, [progress({ cancelledQty: 2, remaining: 3, claimable: 3 })]), "PARTIAL");
assert.equal(derivePrStatus({ status: "SUBMITTED" }, [progress({ orderedQty: 3, cancelledQty: 2, remaining: 0, claimable: 0 }), progress({ fromStockQty: 5, remaining: 0, claimable: 0 })]), "COMPLETED");
assert.equal(derivePrStatus({ status: "SUBMITTED" }, [progress({ cancelledQty: 5, remaining: 0, claimable: 0 })]), "CANCELLED");

// ── lock ──
assert.equal(isPrLocked([progress({})], []), false);
assert.equal(isPrLocked([progress({})], [link("PO-C", 1)]), true, "any link, even on a cancelled PO, locks");
assert.equal(isPrLocked([progress({ fromStockQty: 1 })], []), true);
assert.equal(isPrLocked([progress({ cancelledQty: 1 })], []), true);

// ── PO link validation ──
{
  const prItems = [item(), item({ prItemId: "PRI000002", prId: "PR000002", productId: "P1" }), item({ prItemId: "PRI000003", productId: "P2" })];
  const prs = [pr(), pr({ prId: "PR000002", prNo: "AIC-PR-2026-0002" })];
  const base = { prItems, prs, poStatus: statuses };

  // valid single link
  assert.deepEqual(validatePoLinks({ ...base, poNumber: "PO-NEW", allLinks: [], items: [{ itemNo: 1, productId: "P1", quantity: 10, prLinks: [{ prItemId: "PRI000001", quantity: 10 }] }] }), []);
  // more than claimable
  assert.equal(validatePoLinks({ ...base, poNumber: "PO-NEW", allLinks: [link("PO-A", 8)], items: [{ itemNo: 1, productId: "P1", quantity: 5, prLinks: [{ prItemId: "PRI000001", quantity: 5 }] }] }).length, 1);
  // re-saving the same draft with its own existing links is valid
  assert.deepEqual(validatePoLinks({ ...base, poNumber: "PO-B", allLinks: [link("PO-B", 10)], items: [{ itemNo: 1, productId: "P1", quantity: 10, prLinks: [{ prItemId: "PRI000001", quantity: 10 }] }] }), []);
  // a second draft cannot claim qty already on another draft
  assert.equal(validatePoLinks({ ...base, poNumber: "PO-NEW", allLinks: [link("PO-B", 8)], items: [{ itemNo: 1, productId: "P1", quantity: 3, prLinks: [{ prItemId: "PRI000001", quantity: 3 }] }] }).length, 1);
  // links on cancelled POs free the qty again
  assert.deepEqual(validatePoLinks({ ...base, poNumber: "PO-NEW", allLinks: [link("PO-C", 10)], items: [{ itemNo: 1, productId: "P1", quantity: 10, prLinks: [{ prItemId: "PRI000001", quantity: 10 }] }] }), []);
  // PR not submitted
  for (const status of ["DRAFT", "CANCELLED"] as const) {
    const errors = validatePoLinks({ ...base, prs: [pr({ status }), prs[1]], poNumber: "PO-NEW", allLinks: [], items: [{ itemNo: 1, productId: "P1", quantity: 1, prLinks: [{ prItemId: "PRI000001", quantity: 1 }] }] });
    assert.equal(errors.length, 1, `PR ${status} must be refused`);
  }
  // product mismatch
  assert.equal(validatePoLinks({ ...base, poNumber: "PO-NEW", allLinks: [], items: [{ itemNo: 1, productId: "P1", quantity: 1, prLinks: [{ prItemId: "PRI000003", quantity: 1 }] }] }).length, 1);
  // unknown PR line
  assert.equal(validatePoLinks({ ...base, poNumber: "PO-NEW", allLinks: [], items: [{ itemNo: 1, productId: "P1", quantity: 1, prLinks: [{ prItemId: "NOPE", quantity: 1 }] }] }).length, 1);
  // non-positive link qty
  assert.equal(validatePoLinks({ ...base, poNumber: "PO-NEW", allLinks: [], items: [{ itemNo: 1, productId: "P1", quantity: 1, prLinks: [{ prItemId: "PRI000001", quantity: 0 }] }] }).length, 1);
  // PO line qty below its links
  const below = validatePoLinks({ ...base, poNumber: "PO-NEW", allLinks: [], items: [{ itemNo: 1, productId: "P1", quantity: 3, prLinks: [{ prItemId: "PRI000001", quantity: 5 }] }] });
  assert.equal(below.length, 1);
  assert.match(below[0], /linked/i);
  // merged line from two PRs within line qty
  assert.deepEqual(validatePoLinks({ ...base, poNumber: "PO-NEW", allLinks: [], items: [{ itemNo: 1, productId: "P1", quantity: 25, prLinks: [{ prItemId: "PRI000001", quantity: 10 }, { prItemId: "PRI000002", quantity: 10 }] }] }), []);
  // same PR line claimed across two PO lines adds up
  assert.equal(validatePoLinks({ ...base, poNumber: "PO-NEW", allLinks: [], items: [
    { itemNo: 1, productId: "P1", quantity: 6, prLinks: [{ prItemId: "PRI000001", quantity: 6 }] },
    { itemNo: 2, productId: "P1", quantity: 6, prLinks: [{ prItemId: "PRI000001", quantity: 6 }] },
  ] }).length, 1);
  // message names PR number and product
  const named = validatePoLinks({ ...base, poNumber: "PO-NEW", allLinks: [link("PO-A", 10)], items: [{ itemNo: 1, productId: "P1", quantity: 1, prLinks: [{ prItemId: "PRI000001", quantity: 1 }] }] });
  assert.match(named[0], /AIC-PR-2026-0001/);
  assert.match(named[0], /Filter/);
}

// ── line actions ──
{
  const p = progress({ remaining: 5, claimable: 3, onDraftQty: 2 });
  assert.notEqual(validateFromStock(p, 0), null);
  assert.notEqual(validateFromStock(p, 4), null);
  assert.equal(validateFromStock(p, 3), null);
  assert.notEqual(validateCancelRemaining(p, 2, "  "), null);
  assert.notEqual(validateCancelRemaining(p, 4, "not needed"), null);
  assert.equal(validateCancelRemaining(p, 3, "not needed"), null);
}
