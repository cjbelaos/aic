# Contract Releases Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn Contract Releases into a customer-first release tool with a backlog beside it, backed by a catch-up ledger computed from the release log, with releases recorded server-side through the normal DR flow.

**Architecture:** A pure ledger engine (`src/lib/contractReleases/ledger.ts`) allocates counted releases FIFO across each contract item's periods from contract start to today. A server loader feeds it Sheets data and replaces every reader of the `ContractPeriodSummaries` sheet. `POST /api/deliveries` gains `contractLines` and appends `ContractReleases` rows itself; whether a row counts is decided by its DR's status at read time. The page becomes backlog + customer panel + an in-page release sheet that creates one DR per agreement.

**Tech Stack:** Next.js 16 (App Router; read `node_modules/next/dist/docs/` before touching routes), React, shadcn/ui, Google Sheets via `googleapis`, Node `assert` test scripts compiled with `tsc` (pattern: `scripts/purchase-request-tests/`).

**Spec:** `docs/superpowers/specs/2026-11-21-contract-releases-redesign-design.md`

## Global Constraints

- Dates are `YYYY-MM-DD` strings; "today" is `manilaToday()` from `src/lib/contractStatus.ts`. No `Date` timezone math in the engine.
- Periods are calendar-aligned exactly like `getPeriodInfo` (`src/lib/utils/contractRelease.utils.ts`): Monthly, Quarterly (Jan/Apr/Jul/Oct), Semi-Annual (Jan/Jul), Annual (Jan); `One-Time` = a single period, the one containing the contract start, spanning to contract end.
- Periods start at the contract start date with **no cut-off** (Chris).
- Catch-up: a release pays the oldest open period first, and only periods whose `periodStart <= releaseDate`. Leftover is `extraQty`; never pre-pays.
- A release counts unless its status is `Deleted`/`Cancelled`, or it has a `drNumber` whose DR status (lower-cased, trimmed) is one of `draft`, `pending_approval`, `rejected`, `deleted`. Unknown DR numbers and releases without a DR count.
- Release DRs never carry a Sales Order. One DR per agreement. PO agreements prefill `poNo` from `contract.poNumber`.
- Over-releasing against what is owed only warns; never blocks.
- Backlog and customer search only include contracts where `effectiveContractStatus(c) === "Active"`.
- Do not write to or delete the `ContractPeriodSummaries` sheet.
- Do not change the stock guard, approval flow or Sales Order validation in `POST /api/deliveries`.

## Review Focus

1. **Pre-delivery** (release of 4 on 2026-01-10, Monthly entitled 2, today 2026-02-15): Jan Completed, Feb `Pending` with 0 allocated, `extraQty` 2. Test in Task 1.
2. **DR later rejected or deleted** after its release row was written: the release stops counting and the period reopens. Test in Task 1.
3. **Legacy/bad contract dates** (empty or non-ISO `startDate`, `endDate` before `startDate`): engine returns no periods, never loops or throws. Test in Task 1.
4. **Mid-period start** (Quarterly item, contract starts 2026-02-15): first period is 2026-01-01..2026-03-31 with full entitlement. Test in Task 1.
5. **Double-submit of the release sheet**: the Release button is disabled while saving so one click makes one DR. Checked in Task 5's manual verification.

---

## File Structure

- Create `src/lib/contractReleases/ledger.ts`: pure engine (periods, counting, FIFO allocation, backlog/customer shaping).
- Create `src/lib/contractReleases/lines.ts`: pure validation of `contractLines` on a DR payload.
- Create `src/lib/contractReleases/source.ts`: server-only Sheets loader + `getComputedPeriodSummaries`, `getBacklog`, `getCustomerLedger`.
- Create `src/app/api/contract-releases/backlog/route.ts`, `src/app/api/contract-releases/customers/[companyId]/route.ts`.
- Create `src/app/dashboard/contract-releases/release-sheet.tsx`, `backlog-list.tsx`, `customer-panel.tsx`.
- Create `scripts/contract-release-tests/{tsconfig.json,run.ts,ledger-test.ts,lines-test.ts}`; add `test:contract-releases` to `package.json`.
- Modify `src/types/contract-release.ts`, `src/types/deliveryReceipt.ts`, `src/app/api/deliveries/route.ts`, `src/app/dashboard/delivery-releases/page.tsx`, `src/app/dashboard/contract-releases/page.tsx`, the summary/overdue/compliance routes, `src/lib/purchaseRequests/service.ts`, `src/lib/services/contractRelease.service.ts`.
- Delete `src/app/api/contract-releases/process/route.ts`.

---

### Task 1: Ledger engine

**Files:**
- Create: `src/lib/contractReleases/ledger.ts`
- Modify: `src/types/contract-release.ts` (add types below)
- Create: `scripts/contract-release-tests/tsconfig.json` (copy `scripts/purchase-request-tests/tsconfig.json`; `outDir` `../../tmp/contract-release-tests/out`; include `*.ts`, `../../src/lib/contractReleases/ledger.ts`, `../../src/lib/contractReleases/lines.ts`, `../../src/lib/contractStatus.ts`, `../../src/types/contract.ts`, `../../src/types/contract-release.ts`)
- Create: `scripts/contract-release-tests/run.ts` (imports `./ledger-test.ts`, `./lines-test.ts`, logs `All contract-release tests passed.`)
- Create: `scripts/contract-release-tests/ledger-test.ts`
- Modify: `package.json`: `"test:contract-releases": "npx tsc -p scripts/contract-release-tests/tsconfig.json && node tmp/contract-release-tests/out/scripts/contract-release-tests/run.js"`

Engine files use relative `.ts` imports (as `contractDue.ts` does) so the test tsconfig compiles them.

**Interfaces:**
- Produces (types in `src/types/contract-release.ts`):
```ts
export interface LedgerPeriod extends ContractPeriodSummary { shortfall: number }
export interface ItemLedger {
  contractItemId: string; contractId: string; productCode: string; productId: string;
  frequency: string; entitledQty: number;
  periods: LedgerPeriod[];      // oldest first
  owedNow: number;              // sum of shortfall over all generated periods
  openPeriods: number;          // periods with shortfall > 0
  oldestOpen: string;           // "YYYY-MM" of oldest open period, "" if none
  extraQty: number;
}
```
- Produces (functions in `ledger.ts`):
  - `isReleaseCounted(release: ContractRelease, drStatus: Map<number, string>): boolean`
  - `generatePeriods(frequency: string, startDate: string, endDate: string, today: string): { periodStart: string; periodEnd: string; year: number; month: number; quarter: number }[]`
  - `computeItemLedger(item: ContractItem, contract: Contract, releases: ContractRelease[], drStatus: Map<number, string>, today: string): ItemLedger` (`releases` may contain other items' rows; filter by `contractItemId`)
  - `computeLedgers(input: { contracts: Contract[]; items: ContractItem[]; releases: ContractRelease[]; drStatus: Map<number, string>; today: string }): ItemLedger[]` (Active items only, all contracts)

- [ ] **Step 1: Write failing tests in `ledger-test.ts`**

Fixtures: `contract(start, end)`, `item(freq, qty, status="Active")`, `rel(date, qty, drNumber?, status="Completed")`. Assertions, all with item Monthly entitled 2 unless stated:

```ts
// Chris's catch-up: Oct missed; Nov 3 and Nov 25 releases of 2 each; today 2026-11-26; start 2026-10-01
const l = computeItemLedger(item("Monthly", 2), contract("2026-10-01", "2027-09-30"), [rel("2026-11-03", 2), rel("2026-11-25", 2)], new Map(), "2026-11-26");
assert.deepEqual(l.periods.map(p => [p.periodStart, p.releasedQty, p.status]), [["2026-10-01", 2, "Completed"], ["2026-11-01", 2, "Completed"]]);
assert.equal(l.owedNow, 0);
// Zero-release month is overdue; current month pending
const z = computeItemLedger(item("Monthly", 2), contract("2026-09-01", "2027-08-31"), [], new Map(), "2026-11-10");
assert.deepEqual(z.periods.map(p => p.status), ["Overdue", "Overdue", "Pending"]);
assert.equal(z.owedNow, 6); assert.equal(z.openPeriods, 3); assert.equal(z.oldestOpen, "2026-09");
// Partial current month
// rel("2026-11-02",1), today 2026-11-10, start 2026-11-01 → status "Partial", shortfall 1
// Pre-delivery (Review Focus 1)
// start 2026-01-01, rel("2026-01-10",4), today 2026-02-15 → Jan Completed 2, Feb Pending 0, extraQty 2, owedNow 2
// Rejected DR (Review Focus 2)
// rel("2026-11-02",2,900), drStatus Map([[900,"rejected"]]) → Nov releasedQty 0; Map([[900," Printed "]]) → 2; no map entry → 2
// Deleted release row: rel(...,"Deleted") → not counted
// Bad dates (Review Focus 3): startDate "", "2026/01/01", or end < start → periods []
// Mid-period start (Review Focus 4): Quarterly, start 2026-02-15, today 2026-05-01 → periodStarts ["2026-01-01","2026-04-01"], entitled 2 each
// Ends: contract end 2026-10-31, today 2026-12-05 → last period starts 2026-10-01
// Semi-Annual: start 2026-03-01, today 2026-08-01 → ["2026-01-01","2026-07-01"]
// One-Time: start 2026-03-10, end 2027-03-09, today 2026-12-01 → one period 2026-03-01..2027-03-09
// periodId format: `PER-${contractItemId}-${year}-${MM}` with month = period's first month
// computeLedgers skips Inactive items
```

- [ ] **Step 2: Run to verify failure**

Run: `npm run test:contract-releases`
Expected: tsc error, `ledger.ts` not found.

- [ ] **Step 3: Implement `ledger.ts`**

Algorithm for `computeItemLedger`:
```
periods = generatePeriods(item.frequency, contract.startDate, contract.endDate, today)  // [] on invalid dates
counted = releases where contractItemId === item.id && isReleaseCounted, sorted by releaseDate then id
for each release: remaining = qty
  for each period oldest→newest with allocated < entitled and periodStart <= release.releaseDate:
    take = min(remaining, entitled - allocated); allocate; record release on period (count, first/last date)
    if remaining == 0 break
  extraQty += remaining
status per period: allocated >= entitled → Completed; periodEnd < today → Overdue; allocated > 0 → Partial; else Pending
daysToComplete when Completed: whole days between first and last contributing release dates
```
`generatePeriods`: validate both dates with `/^\d{4}-\d{2}-\d{2}$/` and `start <= end`; step whole periods from the aligned start; stop when `periodStart > min(today, endDate)`; last `periodEnd` capped at `endDate`. Hard cap 600 iterations.

- [ ] **Step 4: Run tests to verify pass**

Run: `npm run test:contract-releases`
Expected: `All contract-release tests passed.`

- [ ] **Step 5: Commit**

```bash
git add src/lib/contractReleases/ledger.ts src/types/contract-release.ts scripts/contract-release-tests package.json
git commit -m "feat(contract-releases): catch-up ledger engine computed from the release log"
```

---

### Task 2: Server loader and readers moved to the ledger

**Files:**
- Create: `src/lib/contractReleases/source.ts`
- Modify: `src/app/api/contract-period-summaries/route.ts`, `src/app/api/contract-period-summaries/current/route.ts`, `src/app/api/contract-releases/overdue/route.ts`, `src/app/api/contract-releases/compliance/route.ts`, `src/lib/purchaseRequests/service.ts:398`

**Interfaces:**
- Consumes: `computeLedgers`, `ItemLedger` (Task 1).
- Produces (`source.ts`, server-only):
  - `loadLedgers(): Promise<{ ledgers: ItemLedger[]; contracts: Contract[]; items: ContractItem[]; releases: ContractRelease[]; drs: DeliveryReceiptSummary[]; today: string }>`: one `Promise.all` over `getContracts`, `getContractItems`, `getContractReleases`, `getDeliveryReceipts`; `drStatus` from `drs`.
  - `getComputedPeriodSummaries(contractItemId?: string, periodYear?: number, periodMonth?: number, contractId?: string): Promise<ContractPeriodSummary[]>`: same signature and filter semantics as `getPeriodSummaries` in `src/lib/contractPeriodSummarySheets.ts`, returning flattened `ledger.periods`.

- [ ] **Step 1: Implement `source.ts`**
- [ ] **Step 2: Swap readers.** Replace the `getPeriodSummaries` import/call with `getComputedPeriodSummaries` in the five files listed. `overdue/route.ts` returns periods with `status === "Overdue"` only from effective-Active contracts. `current/route.ts` returns, per item, the period containing `manilaToday()`.
- [ ] **Step 3: Verify**

Run: `npx tsc --noEmit -p . && npm run test:purchase-requests && npm run test:contract-releases`
Expected: no type errors; both suites print their pass line. Then `rg "contractPeriodSummarySheets" src` must list only that file and `api/contract-releases/process/route.ts`.

- [ ] **Step 4: Commit**

```bash
git commit -am "refactor(contract-releases): read period status from the computed ledger everywhere"
```

---

### Task 3: Record releases on the server from DR creation

**Files:**
- Create: `src/lib/contractReleases/lines.ts`, `scripts/contract-release-tests/lines-test.ts`
- Modify: `src/types/deliveryReceipt.ts` (`CreateDeliveryPayload`), `src/app/api/deliveries/route.ts`, `src/app/dashboard/delivery-releases/page.tsx:340-373, 1092-1127`

**Interfaces:**
- Produces:
```ts
// deliveryReceipt.ts
export interface ContractLine { contractItemId: string; quantity: number; deliveryLineIndex: number }
// CreateDeliveryPayload gains: contractLines?: ContractLine[]
// lines.ts
export function validateContractLines(input: {
  lines: ContractLine[]; companyId: string; salesOrderId?: string;
  items: DeliveryItem[]; contractItems: ContractItem[]; contracts: Contract[];
}): { error: string } | { ok: true }
```
- Consumes: `addContractRelease`, `generateReleaseId` (`src/lib/contractReleaseSheets.ts`), `getPeriodInfo`.

- [ ] **Step 1: Write failing tests in `lines-test.ts`.** Each rule returns an `error` string containing the quoted fragment:
  - empty `lines` → `{ ok: true }`
  - `salesOrderId` set and lines non-empty → `"Sales Order"`
  - unknown item → `"not found"`; Inactive item → `"inactive"`
  - item's contract belongs to another company → `"different customer"`
  - `deliveryLineIndex` out of range → `"line"`; line product (`productId` if both set, else `productCode` case-insensitive) differs from item → `"does not match"`
  - quantity < 1, non-integer, or > that delivery line's quantity → `"quantity"`
  - two lines whose items belong to different contracts → `"one agreement"`
- [ ] **Step 2: Run** `npm run test:contract-releases`. Expected: FAIL, `validateContractLines` not exported.
- [ ] **Step 3: Implement `validateContractLines`.**
- [ ] **Step 4: Run** `npm run test:contract-releases`. Expected: PASS.
- [ ] **Step 5: Wire into `POST /api/deliveries`.** Validate before `guardedDrWrite` (422 on error, skipped for drafts). After the write succeeds, for every resulting status except `draft`, append one `ContractRelease` per line: `contractItemId`, `contractId`, period fields from `getPeriodInfo(new Date(body.date + "T00:00:00"), item.frequency)` (history only), `releaseDate = body.date`, `quantity`, `releasedBy = body.preparedBy`, `remarks = body.comments`, `status: "Completed"`, `drNumber`. Wrap appends in try/catch; on failure log and add `contractReleaseError: "DR saved but contract release was not recorded. Contact an admin."` to the JSON response (DR stays saved).
- [ ] **Step 6: Delivery Release page.** Add `contractItemId: item.id` to the mapped contract rows (line 358). Replace the browser `processRelease` loop (1092-1127) with building `contractLines` in the payload, first Active item of the matching product, only when no Sales Order is selected. Lines belonging to more than one contract → keep only the first contract's lines and `toast.warning("Only CTR-xxxx was counted; release other agreements on separate DRs.")`. Show `res.contractReleaseError` via `toast.error`.
- [ ] **Step 7: Verify**

Run: `npx tsc --noEmit -p . && npm run test:contract-releases && npm run test:delivery-releases`
Expected: all pass.

- [ ] **Step 8: Commit**

```bash
git commit -am "feat(deliveries): record contract releases server-side from DR creation"
```

---

### Task 4: Backlog and customer ledger APIs

**Files:**
- Modify: `src/lib/contractReleases/ledger.ts`, `scripts/contract-release-tests/ledger-test.ts`, `src/lib/contractReleases/source.ts`, `src/types/contract-release.ts`, `src/lib/services/contractRelease.service.ts`
- Create: `src/app/api/contract-releases/backlog/route.ts`, `src/app/api/contract-releases/customers/[companyId]/route.ts`

**Interfaces:**
- Produces types:
```ts
export interface BacklogCustomer { companyId: string; companyName: string; owedQty: number; overduePeriods: number; oldestOverdue: string; agreementCount: number }
export interface ItemLedgerView extends ItemLedger { productName: string; unit: string }
export interface AgreementLedger { contractId: string; agreementType: "Contract" | "PO"; poNumber: string; description: string; startDate: string; endDate: string; items: ItemLedgerView[] }
export interface LinkedDr { drNumber: number; date: string; status: string; itemCount: number; contractId: string; driveFileLink?: string }
export interface CustomerLedger { companyId: string; companyName: string; agreements: AgreementLedger[]; linkedDrs: LinkedDr[] }
```
- Produces pure functions in `ledger.ts`:
  - `buildBacklog(ledgers: ItemLedger[], contracts: Contract[], companyNames: Map<string, string>, today: string): BacklogCustomer[]`: effective-Active contracts only; customers with `owedQty > 0`; sort by `oldestOverdue` ascending ("" last), then `owedQty` descending.
  - `buildCustomerLedger(companyId: string, ledgers: ItemLedger[], contracts: Contract[], products: { code: string; name: string; unit: string }[], releases: ContractRelease[], drs: DeliveryReceiptSummary[], companyName: string, today: string): CustomerLedger`: effective-Active agreements of that customer sorted by `contractId`; `linkedDrs` = distinct `drNumber`s on that customer's release rows, newest first.
- Produces in `source.ts`: `getBacklog(): Promise<BacklogCustomer[]>`, `getCustomerLedger(companyId: string): Promise<CustomerLedger>`.
- Produces in `contractRelease.service.ts`: `getBacklog(): Promise<BacklogCustomer[]>`, `getCustomerLedger(companyId: string): Promise<CustomerLedger>`.

- [ ] **Step 1: Write failing tests:** expired contract's shortfall excluded from backlog; two customers sorted by oldest overdue; a customer with only a current-month shortfall has `oldestOverdue === ""` and sorts after overdue ones; `buildCustomerLedger` excludes other customers' agreements and orders `linkedDrs` newest first.
- [ ] **Step 2: Run** `npm run test:contract-releases`. Expected: FAIL.
- [ ] **Step 3: Implement both functions, the loader functions and the two GET routes** (auth via `requireAuthenticatedSession`; 500 with `{ error }` on failure; `params` is a Promise in Next 16, as in `src/app/api/inventory/approvals/dr/[id]/route.ts`).
- [ ] **Step 4: Run** `npx tsc --noEmit -p . && npm run test:contract-releases`. Expected: PASS.
- [ ] **Step 5: Commit**

```bash
git commit -am "feat(contract-releases): backlog and customer ledger APIs"
```

---

### Task 5: Page redesign and release sheet

**Files:**
- Rewrite: `src/app/dashboard/contract-releases/page.tsx`
- Create: `backlog-list.tsx`, `customer-panel.tsx`, `release-sheet.tsx` in the same folder

**Interfaces:**
- Consumes: `contractReleaseService.getBacklog/getCustomerLedger` (Task 4), `CreateDeliveryPayload.contractLines` (Task 3), `useActiveWarehouses`, `WarehouseSelect`, `useStockCheck`, `StockLineHint`, `approvalPrompt` (`src/components/inventory/dr-stock.tsx`), `deliveryService.getDrivers/createAndPopulateSheet/getPreview`, `DeliveryReceiptPreviewModal`, `Sheet` (`src/components/ui/sheet.tsx`), `SearchableSelect`.
- Produces: `<ReleaseSheet customer={CustomerLedger} agreement={AgreementLedger} open onOpenChange onReleased={(res: DeliveryReceiptResponse) => void} />`

Layout per spec §3 sketch: header (title + 3 tiles: customers owed, overdue periods, oldest overdue period); customer `SearchableSelect` (customers from backlog plus any customer with an effective-Active agreement, from `contractService.getAll` + `companyService.getAll`); two columns on `lg` (backlog left, customer panel right), stacked below `lg`. Selected customer is kept in the URL as `?customer=<companyId>` so a refresh keeps it.

- Backlog row: company name, `owed {owedQty}`, `{overduePeriods} overdue`, `since {oldestOverdue as "Sep 2026"}`; click selects customer. Empty state: "Nothing owed. All active agreements are up to date."
- Customer panel: per agreement a card titled `{contractId} · {agreementType}{PO ? " · PO " + poNumber : ""}`, description beneath; per item row: product name, `owed {owedNow}`, chips for open periods (`Sep ⚠1`, current shown as `Nov 0/2`), and when `openPeriods > 1` the hint `catch-up: {openPeriods} visits due`. Card button `Release…` opens the sheet for that agreement (disabled when `owedNow` is 0 for every item; extra-only releases go through the Delivery Release page). Collapsible "History": linked DRs (preview/open PDF, as the current page does) and a full period table (product, period, expected, released, status).
- Release sheet: fields Warehouse (required), Delivered By (required, driver options), Date (default today), Remarks; rows prefilled `quantity = owedNow`, showing `owed N` and a stock hint; amber warning text when quantity > owedNow; "Add extra item" row with product `SearchableSelect` (no contract line). Submit builds `CreateDeliveryPayload` with `status: "printed"`, `poNo` = agreement PO number for PO-type else `""`, no Sales Order fields, `preparedBy` = logged-in full name, `contractLines` for non-extra rows with quantity > 0. Run `approvalPrompt` + `window.confirm` like the DR page. Button disabled and spinning while saving. On `status === "pending_approval"`: toast `Sent for approval. It will count once a manager approves it.`; else open DR preview. Always refresh backlog and customer ledger after.

- [ ] **Step 1: Build the three components and the page**
- [ ] **Step 2: Typecheck and lint.** Run `npx tsc --noEmit -p . && npx eslint src/app/dashboard/contract-releases`. Expected: clean.
- [ ] **Step 3: Manual verification** with the `run` skill against the dev server, on a test customer:
  1. The backlog lists customers by name, oldest overdue first; clicking one loads the panel.
  2. Release one period's owed quantity: the DR preview opens; after refresh the oldest overdue chip clears (catch-up).
  3. Double-click Release: exactly one DR is created (Review Focus 5).
  4. A quantity that triggers safety-stock approval: toast says sent for approval; the chip stays open until approved in Inventory approvals, then clears.
  5. PO agreement: the DR shows the agreement's PO no. and no Sales Order. Creating a Service Invoice from that DR prefills the PMS fee.
  6. Narrow window (≈390px): backlog stacks above the panel with no horizontal scroll.
- [ ] **Step 4: Commit**

```bash
git commit -am "feat(contract-releases): customer-first page with backlog and in-page release"
```

---

### Task 6: Remove the old path and record the handoff

**Files:**
- Delete: `src/app/api/contract-releases/process/route.ts`
- Modify: `src/lib/services/contractRelease.service.ts` (remove `processRelease`, `getOverdueReleases` if unused)
- Modify: `C:\Users\chris\KOS\02 - Projects\Active\AIC\handoff.md` (replace content: branch, what shipped, follow-up "link monthly PMS Service Invoice to the PO's Sales Order", known limit "editing a DR's quantities does not update its release rows")

- [ ] **Step 1: Delete and clean up.** `rg "contract-releases/process|processRelease|upsertPeriodSummary" src` must return nothing outside `contractPeriodSummarySheets.ts`.
- [ ] **Step 2: Verify.** Run `npx tsc --noEmit -p . && npm run test:contract-releases && npm run test:purchase-requests && npm run test:delivery-releases && npm run test:contracts && npm run build`. Expected: all pass, build succeeds.
- [ ] **Step 3: Commit**

```bash
git commit -am "chore(contract-releases): remove browser-side release processing"
```
