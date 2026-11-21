import assert from "node:assert/strict";
import { computeContractDue, contractProductIssue, periodWindow } from "../../src/lib/purchaseRequests/contractDue.ts";
import type { ContractItem } from "../../src/types/contract.ts";
import type { ContractPeriodSummary } from "../../src/types/contract-release.ts";
import type { PurchaseRequest, PurchaseRequestItem } from "../../src/types/purchaseRequest.ts";

// ── calendar windows ──
assert.deepEqual(periodWindow("Monthly", "2026-11-21"), { start: "2026-11-01", end: "2026-11-30" });
assert.deepEqual(periodWindow("Monthly", "2028-02-10"), { start: "2028-02-01", end: "2028-02-29" });
assert.deepEqual(periodWindow("Quarterly", "2026-11-21"), { start: "2026-10-01", end: "2026-12-31" });
assert.deepEqual(periodWindow("Semi-Annual", "2026-03-02"), { start: "2026-01-01", end: "2026-06-30" });
assert.deepEqual(periodWindow("Semi-Annual", "2026-07-01"), { start: "2026-07-01", end: "2026-12-31" });
assert.deepEqual(periodWindow("Annual", "2026-03-02"), { start: "2026-01-01", end: "2026-12-31" });
assert.deepEqual(periodWindow("One-Time", "2026-03-02"), { start: "0000-01-01", end: "9999-12-31" });

// ── fixtures ──
const ci = (id: string, frequency: string, entitledQty: number, status: "Active" | "Inactive" = "Active"): ContractItem =>
  ({ id, contractId: "CTR-0001", productId: `P-${id}`, productCode: `C-${id}`, entitledQty, frequency, status });
const summary = (contractItemId: string, releasedQty: number, periodStart: string, periodEnd: string): ContractPeriodSummary => ({
  periodId: `PER-${contractItemId}`, contractItemId, contractId: "CTR-0001", productCode: "", periodYear: 2026, periodMonth: 11, periodQuarter: 4,
  frequency: "Monthly", entitledQty: 4, releasedQty, releaseCount: 1, status: "Partial", periodStart, periodEnd,
});
const pr = (prId: string, prNo: string, status: PurchaseRequest["status"], requestedDate: string): PurchaseRequest => ({
  prId, prNo, status, requestType: "CONTRACT", salesOrderId: "", salesOrderNoSnapshot: "", customerNameSnapshot: "", quotationNoSnapshot: "",
  deliveryAddressSnapshot: "", requestedByUserId: "u1", requestedByName: "Tech", requestedDate, neededByDate: "", purpose: "", cancelReason: "",
  version: 1, createdAt: "", createdBy: "", updatedAt: "", updatedBy: "", contractId: "CTR-0001", contractNoSnapshot: "CTR-0001",
});
const line = (prId: string, contractItemId: string, quantity: number, cancelledQty = 0): PurchaseRequestItem => ({
  prItemId: `${prId}-${contractItemId}`, prId, lineNo: 1, productId: "P", productCodeSnapshot: "", productNameSnapshot: "", unitId: "", unitSnapshot: "",
  quantity, salesOrderItemId: "", contractItemId, remarks: "", fromStockQty: 0, fromStockNote: "", fromStockBy: "", fromStockAt: "", cancelledQty,
  cancelReason: "", cancelledBy: "", cancelledAt: "", createdAt: "", createdBy: "", updatedAt: "", updatedBy: "",
});

const items = [ci("CTI1", "Monthly", 4), ci("CTI2", "Quarterly", 6), ci("CTI3", "Monthly", 2, "Inactive"), ci("CTI4", "Monthly", 2)];
const summaries = [
  summary("CTI1", 1, "2026-11-01", "2026-11-30"),
  summary("CTI1", 4, "2026-10-01", "2026-10-31"), // previous period: ignored
  summary("CTI4", 5, "2026-11-01", "2026-11-30"), // over-released
];
const prs = [
  pr("A", "AIC-PR-2026-0012", "SUBMITTED", "2026-11-03"),
  pr("B", "AIC-PR-2026-0013", "CANCELLED", "2026-11-04"),
  pr("C", "", "DRAFT", "2026-11-20"),
  pr("D", "AIC-PR-2026-0009", "SUBMITTED", "2026-10-28"),
];
const prItems = [line("A", "CTI1", 4, 1), line("B", "CTI1", 4), line("C", "CTI1", 2), line("D", "CTI1", 3), line("A", "CTI2", 2, 2)];

const due = computeContractDue({ items, summaries, prs, prItems, today: "2026-11-21" });
assert.deepEqual(due.map((d) => d.contractItemId), ["CTI1", "CTI2", "CTI4"]);
const [d1, d2, d4] = due;
assert.deepEqual({ ...d1 }, {
  contractItemId: "CTI1", productId: "P-CTI1", productCode: "C-CTI1", frequency: "Monthly", entitledQty: 4, releasedQty: 1, dueQty: 3,
  alreadyRequested: [{ prNo: "AIC-PR-2026-0012", quantity: 3 }, { prNo: "Draft", quantity: 2 }],
});
// no summary → full entitlement due; fully cancelled line not listed
assert.equal(d2.releasedQty, 0);
assert.equal(d2.dueQty, 6);
assert.deepEqual(d2.alreadyRequested, []);
assert.equal(d4.dueQty, 0);

// editing PR A: its own lines are not "already requested"
const editing = computeContractDue({ items, summaries, prs, prItems, today: "2026-11-21", excludePrId: "A" });
assert.deepEqual(editing[0].alreadyRequested, [{ prNo: "Draft", quantity: 2 }]);

// ── product problems block "Add from contract" until an admin fixes the contract item ──
assert.equal(contractProductIssue(undefined), "unlinked");
assert.equal(contractProductIssue({ status: "inactive" }), "inactive");
assert.equal(contractProductIssue({ status: "active" }), "");
