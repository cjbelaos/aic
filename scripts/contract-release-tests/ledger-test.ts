import assert from "node:assert/strict";
import { buildBacklog, buildCustomerLedger, computeItemLedger, computeLedgers, generatePeriods, isReleaseCounted } from "../../src/lib/contractReleases/ledger.ts";
import type { Contract, ContractItem } from "../../src/types/contract.ts";
import type { ContractRelease } from "../../src/types/contract-release.ts";
import type { DeliveryReceiptSummary } from "../../src/types/deliveryReceipt.ts";

const contract = (startDate: string, endDate: string): Contract =>
  ({ id: "CTR-0001", companyId: "C1", agreementType: "Contract", startDate, endDate, status: "Active" }) as Contract;
const item = (frequency: string, entitledQty: number, status: "Active" | "Inactive" = "Active"): ContractItem =>
  ({ id: "CTI-0001", contractId: "CTR-0001", productCode: "SKU", productId: "P1", entitledQty, frequency, status }) as ContractItem;
let relN = 0;
const rel = (releaseDate: string, quantity: number, drNumber?: number, status: ContractRelease["status"] = "Completed"): ContractRelease =>
  ({ id: `REL-${String(++relN).padStart(4, "0")}`, contractItemId: "CTI-0001", contractId: "CTR-0001", periodYear: 0, periodMonth: 0, periodQuarter: 0,
    frequency: "Monthly", releaseDate, quantity, releasedBy: "t", status, drNumber }) as ContractRelease;
const none = new Map<number, string>();

// Catch-up
{
  const l = computeItemLedger(item("Monthly", 2), contract("2026-10-01", "2027-09-30"), [rel("2026-11-03", 2), rel("2026-11-25", 2)], none, "2026-11-26");
  assert.deepEqual(l.periods.map(p => [p.periodStart, p.releasedQty, p.status]), [["2026-10-01", 2, "Completed"], ["2026-11-01", 2, "Completed"]]);
  assert.equal(l.owedNow, 0);
  assert.equal(l.periods[0].releaseCount, 1);
  assert.equal(l.periods[0].daysToComplete, 0);
  const d = computeItemLedger(item("Monthly", 4), contract("2026-11-01", "2027-10-31"), [rel("2026-11-03", 2), rel("2026-11-25", 2)], none, "2026-11-26");
  assert.equal(d.periods[0].releaseCount, 2);
  assert.equal(d.periods[0].daysToComplete, 22);
  assert.equal(d.periods[0].firstReleaseDate, "2026-11-03");
  assert.equal(l.productId, "P1");
}
// Overdue / pending
{
  const z = computeItemLedger(item("Monthly", 2), contract("2026-09-01", "2027-08-31"), [], none, "2026-11-10");
  assert.deepEqual(z.periods.map(p => p.status), ["Overdue", "Overdue", "Pending"]);
  assert.equal(z.owedNow, 6); assert.equal(z.openPeriods, 3); assert.equal(z.oldestOpen, "2026-09");
  assert.equal(z.periods[0].periodId, "PER-CTI-0001-2026-09");
  assert.equal(z.periods[0].shortfall, 2);
}
// Partial current month
{
  const l = computeItemLedger(item("Monthly", 2), contract("2026-11-01", "2027-10-31"), [rel("2026-11-02", 1)], none, "2026-11-10");
  assert.equal(l.periods[0].status, "Partial"); assert.equal(l.periods[0].shortfall, 1);
}
// Never pre-pays
{
  const l = computeItemLedger(item("Monthly", 2), contract("2026-09-01", "2027-08-31"), [rel("2026-09-10", 4)], none, "2026-10-15");
  assert.equal(l.periods[0].releasedQty, 2); assert.equal(l.periods[0].status, "Completed");
  assert.equal(l.periods[1].releasedQty, 0); assert.equal(l.periods[1].status, "Pending");
  assert.equal(l.extraQty, 2); assert.equal(l.owedNow, 2);
}
// DR status
{
  const c = contract("2026-11-01", "2027-10-31");
  const q = (m: Map<number, string>) => computeItemLedger(item("Monthly", 2), c, [rel("2026-11-02", 2, 900)], m, "2026-11-10").periods[0].releasedQty;
  assert.equal(q(new Map([[900, "rejected"]])), 0);
  for (const s of ["draft", "pending_approval", "deleted"]) assert.equal(q(new Map([[900, s]])), 0);
  assert.equal(q(new Map([[900, " Printed "]])), 2);
  assert.equal(q(new Map()), 2);
  assert.equal(isReleaseCounted(rel("2026-11-02", 2, undefined, "Deleted"), none), false);
  assert.equal(isReleaseCounted(rel("2026-11-02", 2, undefined, "Cancelled"), none), false);
  assert.equal(isReleaseCounted(rel("2026-11-02", 2), none), true);
}
// Bad dates
for (const [s, e] of [["", "2027-01-01"], ["2026/01/01", "2027-01-01"], ["2026-05-01", "2026-04-01"]])
  assert.deepEqual(generatePeriods("Monthly", s, e, "2026-12-01"), []);
// Mid-period start
{
  const l = computeItemLedger(item("Quarterly", 2), contract("2027-02-15", "2028-02-14"), [], none, "2027-05-01");
  assert.deepEqual(l.periods.map(p => p.periodStart), ["2027-01-01", "2027-04-01"]);
  assert.deepEqual(l.periods.map(p => p.entitledQty), [2, 2]);
}
// Contract end
{
  const p = generatePeriods("Monthly", "2026-08-01", "2026-10-31", "2026-12-05");
  assert.equal(p[p.length - 1].periodStart, "2026-10-01");
  assert.equal(p[p.length - 1].periodEnd, "2026-10-31");
}
// Semi-annual
assert.deepEqual(generatePeriods("Semi-Annual", "2026-03-01", "2027-02-28", "2026-08-01").map(p => p.periodStart), ["2026-01-01", "2026-07-01"]);
// Continuous agreements (blank end date) run periods up to today; One-Time stays a single period.
assert.deepEqual(generatePeriods("Monthly", "2026-09-21", "", "2026-11-25").map(p => p.periodStart), ["2026-09-01", "2026-10-01", "2026-11-01"]);
assert.equal(generatePeriods("One-Time", "2026-09-21", "", "2026-11-25").length, 1);
assert.deepEqual(generatePeriods("Monthly", "2026-09-21", "bad", "2026-11-25"), []);
// One-Time
{
  const p = generatePeriods("One-Time", "2026-03-10", "2027-03-09", "2026-12-01");
  assert.equal(p.length, 1); assert.equal(p[0].periodStart, "2026-03-01"); assert.equal(p[0].periodEnd, "2027-03-09");
}
// computeLedgers skips Inactive and ignores extra-item releases
{
  const items = [item("Monthly", 2), { ...item("Monthly", 2, "Inactive"), id: "CTI-0002" }];
  const extra = { ...rel("2026-11-02", 5), contractItemId: "" };
  const out = computeLedgers({ contracts: [contract("2026-11-01", "2027-10-31")], items, releases: [extra], drStatus: none, today: "2026-11-10" });
  assert.equal(out.length, 1); assert.equal(out[0].periods[0].releasedQty, 0); assert.equal(out[0].extraQty, 0);
}

// Backlog and customer ledger
{
  const today = "2026-11-10";
  const ctr = (id: string, companyId: string, startDate: string, endDate: string, extra: Partial<Contract> = {}): Contract =>
    ({ id, companyId, agreementType: "Contract", startDate, endDate, status: "Active", description: `${id} desc`, ...extra }) as Contract;
  const it = (id: string, contractId: string, productCode = "SKU"): ContractItem =>
    ({ id, contractId, productCode, productId: "", entitledQty: 2, frequency: "Monthly", status: "Active" }) as ContractItem;
  const contracts = [
    ctr("CTR-0001", "A", "2026-10-01", "2027-09-30"),             // A: Oct+Nov owed, oldest overdue 2026-10
    ctr("CTR-0002", "B", "2026-09-01", "2027-08-31"),             // B: oldest overdue 2026-09
    ctr("CTR-0003", "C", "2026-11-01", "2027-10-31"),             // C: only current month owed
    ctr("CTR-0004", "D", "2025-01-01", "2026-10-31"),             // D: expired, shortfall excluded
    ctr("CTR-0005", "E", "2026-11-01", "2027-10-31"),             // E: fully released
    ctr("CTR-0006", "A", "2026-11-01", "2027-10-31", { agreementType: "PO", poNumber: "PO-9" }),
  ];
  const items = [it("I1", "CTR-0001"), it("I2", "CTR-0002"), it("I3", "CTR-0003"), it("I4", "CTR-0004"), it("I5", "CTR-0005"), it("I6", "CTR-0006", "INK")];
  const r = (id: string, contractItemId: string, contractId: string, releaseDate: string, quantity: number, drNumber?: number): ContractRelease =>
    ({ id, contractItemId, contractId, periodYear: 0, periodMonth: 0, periodQuarter: 0, frequency: "Monthly", releaseDate, quantity, releasedBy: "t", status: "Completed", drNumber }) as ContractRelease;
  const releases = [r("R1", "I5", "CTR-0005", "2026-11-02", 2, 10), r("R2", "I1", "CTR-0001", "2026-10-05", 1, 11), r("R3", "I6", "CTR-0006", "2026-11-03", 1, 12), r("R4", "I2", "CTR-0002", "2026-11-04", 1, 13)];
  const ledgers = computeLedgers({ contracts, items, releases, drStatus: none, today });
  const names = new Map([["A", "Alpha"], ["B", "Bravo"], ["C", "Charlie"], ["D", "Delta"], ["E", "Echo"]]);
  const backlog = buildBacklog(ledgers, contracts, names, today);
  assert.deepEqual(backlog.map(b => b.companyId), ["B", "A", "C"]);
  assert.equal(backlog[1].companyName, "Alpha");
  assert.equal(backlog[1].owedQty, 4); // CTR-0001: 1 (Oct) + 2 (Nov); CTR-0006: 1 (Nov)
  assert.equal(backlog[1].overduePeriods, 1);
  assert.equal(backlog[1].oldestOverdue, "2026-10");
  assert.equal(backlog[1].agreementCount, 2);
  assert.equal(backlog[2].oldestOverdue, ""); assert.equal(backlog[2].overduePeriods, 0);
  assert.equal(backlog.find(b => b.companyId === "D"), undefined);

  const drs = [
    { drNumber: 11, date: "2026-10-05", companyId: "A", status: "printed", items: [{}], driveFileLink: "x" },
    { drNumber: 12, date: "2026-11-03", companyId: "A", status: "printed", items: [{}, {}] },
    { drNumber: 13, date: "2026-11-04", companyId: "B", status: "printed", items: [{}] },
  ] as unknown as DeliveryReceiptSummary[];
  const products = [{ code: "SKU", name: "Salt", unit: "BAG" }];
  const cl = buildCustomerLedger("A", ledgers, contracts, products, releases, drs, "Alpha", today);
  assert.deepEqual(cl.agreements.map(a => a.contractId), ["CTR-0001", "CTR-0006"]);
  assert.equal(cl.agreements[1].poNumber, "PO-9"); assert.equal(cl.agreements[1].agreementType, "PO");
  assert.equal(cl.agreements[0].items[0].productName, "Salt"); assert.equal(cl.agreements[0].items[0].unit, "BAG");
  assert.equal(cl.agreements[1].items[0].productName, "INK"); // falls back to code
  // FOR client travels with the agreement so a release DR can send it ("" when none).
  assert.equal(cl.agreements[0].forCompanyId, "");
  const withFor = contracts.map(c => c.id === "CTR-0001" ? { ...c, forCompanyId: "HF" } : c);
  assert.equal(buildCustomerLedger("A", ledgers, withFor, products, releases, drs, "Alpha", today).agreements[0].forCompanyId, "HF");
  assert.deepEqual(cl.linkedDrs.map(d => d.drNumber), [12, 11]);
  assert.equal(cl.linkedDrs[0].itemCount, 2); assert.equal(cl.linkedDrs[0].contractId, "CTR-0006");
  assert.equal(cl.linkedDrs[1].driveFileLink, "x");
  // expired agreements are left out of the customer ledger
  assert.deepEqual(buildCustomerLedger("D", ledgers, contracts, products, releases, drs, "Delta", today).agreements, []);
}

// Review C1: only created/printed/completed DRs count (spec §1)
{
  const c = contract("2026-11-01", "2027-10-31");
  const q = (st: string) => computeItemLedger(item("Monthly", 2), c, [rel("2026-11-02", 2, 901)], new Map([[901, st]]), "2026-11-10").periods[0].releasedQty;
  assert.equal(q("cancelled"), 0);
  assert.equal(q("void"), 0);
  for (const st of ["created", "printed", "Completed"]) assert.equal(q(st), 2);
}
// Review I4: sheet dates read back as M/D/YYYY are normalized; unparseable dates are not counted as extra
{
  const c = contract("2026-11-01", "2027-10-31");
  const l = computeItemLedger(item("Monthly", 2), c, [rel("11/2/2026", 2)], none, "2026-11-10");
  assert.equal(l.periods[0].releasedQty, 2); assert.equal(l.extraQty, 0);
  const bad = computeItemLedger(item("Monthly", 2), c, [rel("", 2)], none, "2026-11-10");
  assert.equal(bad.periods[0].releasedQty, 0); assert.equal(bad.extraQty, 0);
}
// Review I3: a contract whose stored status is not Active keeps only its released history, owes nothing
{
  const closed = { ...contract("2026-09-01", "2027-08-31"), status: "Closed" } as Contract;
  const out = computeLedgers({ contracts: [closed], items: [item("Monthly", 2)], releases: [rel("2026-09-03", 2)], drStatus: none, today: "2026-11-10" });
  assert.deepEqual(out[0].periods.map(p => p.periodStart), ["2026-09-01"]);
  assert.equal(out[0].owedNow, 0); assert.equal(out[0].openPeriods, 0); assert.equal(out[0].oldestOpen, "");
}

// PMS cycle start (Tanay: MOA notarized 2026-04-27, last PMS in Aug 2026 before the first DR)
{
  const c = { ...contract("2026-04-27", "2027-04-26"), pmsCycleStart: "2026-08" } as Contract;
  const l = computeItemLedger(item("Quarterly", 1), c, [], none, "2026-11-22");
  assert.deepEqual(l.periods.map(p => [p.periodStart, p.periodEnd, p.status]),
    [["2026-11-01", "2027-01-31", "Pending"]], "Aug–Oct began before the first DR; tracking starts with Nov–Jan");
  // DR #4089 on Nov 22 releases the filters but not the salt: it pays November, not an old quarter.
  const nov = computeItemLedger(item("Quarterly", 1), c, [rel("2026-11-22", 1)], none, "2026-11-22");
  assert.equal(nov.periods[0].status, "Completed"); assert.equal(nov.extraQty, 0);
  // Salt skipped in November, released on a separate DR in February: it catches up November first.
  const late = computeItemLedger(item("Quarterly", 1), c, [rel("2027-02-10", 1)], none, "2027-02-15");
  assert.deepEqual(late.periods.map(p => [p.periodStart, p.status]), [["2026-11-01", "Completed"], ["2027-02-01", "Pending"]]);
  // Without a cycle start the MOA date keeps calendar quarters.
  assert.equal(computeItemLedger(item("Quarterly", 2), contract("2026-04-27", "2027-04-26"), [], none, "2026-11-22").periods[0].periodStart, "2026-10-01", "Calendar quarters; Jul–Sep began before the first DR");
  assert.deepEqual(generatePeriods("Semi-Annual", "2026-11-01", "2028-01-01", "2027-06-01", true).map(p => p.periodEnd), ["2027-04-30", "2027-10-31"]);
}

// Release tracking starts 2026-08-26 (first DR): periods that began earlier are never owed
{
  const m = computeItemLedger(item("Monthly", 1), contract("2026-04-27", "2027-04-26"), [], none, "2026-10-10");
  assert.deepEqual(m.periods.map(p => p.periodStart), ["2026-09-01", "2026-10-01"], "August began before the first DR");
  assert.equal(m.owedNow, 2);
}
