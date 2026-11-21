# Contract Releases redesign

Date: 2026-11-21
Status: Draft, awaiting Chris's approval

## Intent

The Admin department (Chris included) opens Contract Releases to release contract consumables (filters, salt, etc.) to a technician who is going to a customer for PMS. The page is a work tool, not a report: the question it must answer is "what does this customer still need, and let me release it now."

Today the page fails that job:

- The overdue table shows only a contract ID (`CTR-0015`), no customer, no action.
- Periods with zero releases are never created, so fully missed periods are invisible.
- A late release always counts toward the period of its release date, so an overdue period can never be cleared.
- "Quick Process" creates the DR before checking quantities (orphan DRs), skips warehouse/stock checks, technician selection, and manager approval.
- A DR held for approval on the Delivery Release page never records its contract release, even after approval.
- "Active Contracts 46" counts every contract regardless of status; the contract dropdown has no contract number and no search.

## Goals

1. Customer-first release: pick a customer, see everything owed across all their agreements, oldest first, and release it in one step.
2. A backlog list beside it: every customer with owed items, sorted by how overdue, with customer name, agreement number and description, clickable to load that customer.
3. Catch-up allocation (decided by Chris): a release pays off the oldest open period first; overdue periods clear once delivered.
4. Periods with zero releases count as owed/overdue.
5. One release path that goes through the real DR creation (warehouse, Delivered By, stock guard, approval).
6. Contract release recording moves to the server and is tied to the DR, so held/approved/rejected DRs are handled correctly, for this page and the Delivery Release page.
7. Contract Analytics and Purchase Requests "Add from contract" show the same corrected numbers.

## Non-goals

- No change to the full Delivery Release page layout or its fields.
- No technician scheduling or Field Technician Itinerary integration.
- No change to how contracts or contract items are created.
- No print-layout changes to the DR.

## Anti-goals

- A second way to create DRs that bypasses stock, warehouse, or approval rules.
- Overdue numbers that disagree between Contract Releases, Contract Analytics, and Purchase Requests.
- Flooding the backlog with years of "overdue" periods from before release tracking existed.

## Approaches considered

- **A. Derive period status from the release log on every read (chosen by Chris).** Releases stay a plain log. A pure function allocates each contract item's counted releases FIFO across its periods from start to today. Zero-release periods appear naturally; deletes, rejections and entitlement edits self-correct; no backfill. Cost: the `ContractPeriodSummaries` sheet stops being the source of truth, and Analytics/Purchase Requests move to the shared function.
- B. Split each release into period rows at write time. Fewer consumers change, but splits are frozen (deletes and edits don't rebalance), zero periods need a backfill job, held DRs need deferred splitting. Rejected.
- C. UI-only fix. Overdue still never clears and missed periods stay hidden. Rejected.

## Design

### 1. Allocation engine (pure, server-side, unit-tested)

`computeContractLedger(contract, items, releases, deliveryStatuses, today)` in `src/lib/contractReleases/ledger.ts`:

- For each **Active** contract item, generate its periods using the existing `getPeriodInfo` rules (Monthly, Quarterly, Semi-Annual, Annual). Range: from `contract.pmsCycleStart` when set, else `contract.startDate`, to the period containing `today` (Manila date, `manilaToday()`), capped at `contract.endDate`. Periods that began before 2026-08-26 (the first DR recorded in AIC) are dropped (revised by Chris 2026-11-21).
- `One-Time` items have a single period (the contract start period).
- **Counted releases:** release rows with status not `Deleted`/`Cancelled`, whose linked DR (if any) is in a counted status (`created`, `printed`, `completed`). Releases whose DR is `pending_approval`, `draft`, `rejected`, or deleted are not counted. Releases with no DR number (legacy) are counted.
- Allocate counted releases for the item in release-date order, oldest period first. Each period gets at most `entitledQty`. Quantity left after all periods up to today is **extra**: shown as "extra released", never pre-paying a future period.
- Per period output: `entitledQty`, `allocatedQty`, `status` (`Completed`, `Partial`, `Pending` for the current period, `Overdue` for past periods not complete), `shortfall`.
- Per item output: `owedNow` (sum of shortfall across past and current periods), oldest open period.
- The stored `periodYear/periodMonth` on release rows is ignored by the engine (kept for history only).

Example (Chris's catch-up case): October PMS missed. The early-November release pays October; the late-November release pays November. In November the customer panel shows "owed 2 periods: Oct (overdue) + Nov" with a hint "catch-up: 2 visits due this month" (number of open periods for the item, current included).

Known risk (accepted): an older contract whose past releases were never logged will show those periods as overdue. A "mark as settled" action is deferred until it is actually needed.

### 2. Recording releases on the server

- `CreateDeliveryPayload` gains optional `contractLines: { contractItemId: string; quantity: number; deliveryLineIndex: number }[]`.
- `POST /api/deliveries`, after the guarded write succeeds (any resulting status, including `pending_approval`), appends one `ContractReleases` row per contract line with the DR number. The engine decides whether it counts, based on the DR status. Approval and rejection then need no extra hook.
- Server validates each contract line: item exists, is Active, belongs to the DR's customer, product matches the referenced delivery line, and quantity <= that delivery line's quantity. Over-allocation versus owed is **not** rejected (warning only in the UI); excess becomes "extra".
- The Delivery Release page stops calling `/api/contract-releases/process` from the browser and sends `contractLines` instead (keeping its current product-match behaviour, now server-side). `POST /api/contract-releases/process` is removed once nothing calls it.

### 3. Page layout (customer first, backlog beside)

```
┌ Contract Releases ─────────────────────────────────────────────────────┐
│ [Search customer…                               ]                     │
├──────────────────────────────┬─────────────────────────────────────────┤
│ Backlog (owed now)           │ SAN PABLO COLLEGES MEDICAL CENTER       │
│ ▸ San Pablo Colleges   3  ⚠2 │ CTR-0015 · Contract · PMS water system  │
│ ▸ St. Luke's …         2  ⚠1 │  Sediment Filter 20" Blue   owed 2      │
│ ▸ …                          │    Sep ⚠1 · Oct ⚠1 · Nov 0/2            │
│   (sorted oldest overdue)    │ CTR-0041 · PO 4500123 · …               │
│                              │  Regeneration Salt          owed 3      │
│                              │                   [ Release… ]          │
│                              │ ▾ History (linked DRs, period detail)   │
└──────────────────────────────┴─────────────────────────────────────────┘
```

- **Backlog column:** customers with `owedNow > 0`, showing customer name, total owed, number of overdue periods, oldest overdue period. Sorted by oldest overdue. Click loads the customer. Only effective-Active contracts (`effectiveContractStatus`).
- **Customer panel:** each active agreement as a group (number, type, PO number if PO, description), each item with owed quantity and a compact period strip of open periods. Collapsible history: linked DRs (view/open PDF) and full period table.
- **Header tiles:** replaced by three backlog numbers: customers owed, overdue periods, oldest overdue period. "Active Contracts" counts effective-Active only, if kept.
- Customer search is a searchable select over customers with at least one active agreement.
- On narrow screens, backlog collapses above the customer panel.

### 4. Release panel (in-page sheet)

Opened from the customer panel.

- Fields: Warehouse, Delivered By (same driver/technician options as the DR page), Date, Remarks, item rows (prefilled with `owedNow` per item, editable), Add extra item (non-contract product, no contract line).
- **No Sales Order on any release DR** (decided by Chris). For both Contract and PO agreements, the released items are consumables included in the PMS service fee and are never priced or invoiced separately. A PO agreement's Sales Order holds the service fee (e.g. PO Jan–Jun ₱120,000 = 6 × ₱20,000) and belongs to Service Invoice billing, not to the release.
  - Keeping the DR unlinked also preserves today's Service Invoice behaviour: a DR without a Sales Order is recognised as PMS and prefilled with the agreement's service fee (`service-invoices-client.tsx`, `pmsContractForDelivery`).
- PO-type: the DR's PO no. is prefilled from the agreement's `poNumber`, so the technician's DR matches the client's PO. Otherwise identical to Contract-type.
- DR grouping: **one DR per agreement**. Service Invoice prefills the PMS fee only when a DR's releases belong to exactly one contract (`pmsContractForDelivery`), and a DR carries one PO no.
- Prepared By = logged-in user.
- Warning, not block, when a row exceeds owed.
- Submit calls the shared DR creation (`deliveryService.createAndPopulateSheet`) with `contractLines`. On `pending_approval`, show "Sent for approval; it will count once approved." Otherwise open the DR preview.

### 5. Consumers moved to the engine

- `GET /api/contract-releases/overdue` and `GET /api/contract-period-summaries` (+ `/current`) return engine output in the existing `ContractPeriodSummary` shape, so Contract Analytics and Purchase Requests change minimally.
- `getContractDue` in `src/lib/purchaseRequests/service.ts` uses the engine instead of `getPeriodSummaries`.
- `ContractPeriodSummaries` sheet: no longer written or read. Left in place (not deleted).

## Constraints

- Google Sheets is the database; reads are whole-sheet. Engine runs on: contracts, contract items, releases, DR statuses. Fetch once per request.
- Next.js 16: check `node_modules/next/dist/docs/` before route changes.
- Preserve the existing stock guard, approval, and Sales Order validation in `POST /api/deliveries`.

## Left to the builder

- Component split and file names for the page.
- Exact tile styling, empty states, loading states.
- Whether the engine lives in one file or several.

## Calls made by Claude (check these)

- Release beyond what is owed warns, does not block; the excess is "extra" and never pre-pays a future period.
- Releases whose DR is pending approval, draft, rejected or deleted do not count; legacy releases with no DR number do count.
- Recording moves into `POST /api/deliveries`; `/api/contract-releases/process` is removed once unused.
- Only effective-Active contracts appear in the backlog and customer search.
- `ContractPeriodSummaries` sheet is left in place but no longer read or written.
- Release panel fields: Warehouse, Delivered By, Date, Remarks, items, extra items. PO no. prefilled from the agreement on PO-type.
- DR grouping: one DR per agreement (keeps Service Invoice fee prefill working).
- A release only pays periods that had started by its release date; anything beyond that is "extra" (no pre-paying).
- `POST /api/deliveries` rejects `contractLines` on a DR linked to a Sales Order, and the Delivery Release page stops attributing SO-linked DRs to contracts (items on an SO are sold, not PMS entitlements).

## Out of scope (follow-up)

- Linking the monthly PMS Service Invoice to the PO's Sales Order so each ₱20,000 invoice draws down the PO total.
