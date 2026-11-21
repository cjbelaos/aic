# Purchase Requests Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Technicians raise Purchase Requests against Confirmed Sales Orders; Purchasing fulfils PR lines via Purchase Orders (many-to-many at line level) or marks them From stock; PR status is always derived and correct; PRs print on A4 in the PO style.

**Architecture:** Three new Google Sheets tabs (`PurchaseRequests`, `PurchaseRequestItems`, `PurchaseRequestLinks`). All status/remaining logic lives in a pure domain module (`src/lib/purchaseRequests/domain.ts`) that takes PR lines, link rows and a PO-status map and derives everything — nothing is cached. PO saves carry optional `prLinks` per line; the PO sheets layer validates them with the domain module and replaces the PO's link rows wholesale on every item save, and renames them when a Draft PO is finalized.

**Tech Stack:** Next.js 16 (App Router, read `node_modules/next/dist/docs/` before writing routes/pages), TypeScript, Google Sheets via `googleapis`, shadcn/ui, existing `BusinessDocumentPrintFrame` print pipeline.

**Spec:** `docs/superpowers/specs/2026-11-21-purchase-request-design.md`

## Global Constraints

- PR number format `AIC-PR-YYYY-NNNN`, allocated on submit (drafts have none), sequence per year of submit date.
- Only Confirmed Sales Orders (`orderStatus === "CONFIRMED"`) can be picked or submitted against.
- Items are products only (active products from the product list); no prices on the PR.
- PO statuses that do **not** count as ordered: `draft`, `cancelled`, `deleted`. Draft-PO links still reduce *claimable* qty.
- `remaining = quantity − orderedQty − fromStockQty − cancelledQty` (never below 0).
- Links never exceed a line's claimable qty; extra PO qty is unlinked. A PO line's qty may not be below the sum of its links.
- Any logged-in user: create PRs, view all PRs, mark/undo From stock, cancel remaining of a line (with required reason). Edit/cancel a whole PR: requester or Admin (`isAdminRole`), and only while the PR has no links (any PO status), no from-stock qty and no cancelled qty.
- Sales Orders module stays Admin-only; the PR form uses a new narrow read-only endpoint.
- The A4 PO print layout is unchanged except the PR No. cell lists the derived PR numbers.
- Sheets writes are additive; setup script never clears data rows.

## Review Focus

1. **Draft PO finalized** (`DRAFT-…` → real number): its link rows must follow the rename, or the PR silently reopens. → Task 4 test `finalize renames links`.
2. **PO edited to drop or shrink a linked line**: links for removed lines disappear; shrinking below linked qty is refused with a message. → Task 4 tests + Task 1 `validatePoLinks` cases.
3. **PO cancelled or deleted** after linking: PR goes back to Open/Partially handled with no extra write. → Task 1 `deriveLineProgress` case with `cancelled`/`deleted`.
4. **Two draft POs claiming the same PR qty**: the second is refused. → Task 1 `validatePoLinks` claim-against-other-drafts case.
5. **Sales Order put On Hold/Cancelled/Closed between drafting and submitting a PR**: submit refused; existing PRs show the warning badge. → Task 3 `submitPurchaseRequest` check + Task 5 badge.

---

### Task 1: Types and pure domain logic

**Files:**
- Create: `src/types/purchaseRequest.ts`
- Create: `src/lib/purchaseRequests/domain.ts`
- Create: `scripts/purchase-request-tests/tsconfig.json` (copy `scripts/inventory-tests/tsconfig.json`, outDir `../../tmp/purchase-request-tests/out`, include `*.ts`, `../../src/lib/purchaseRequests/domain.ts`, `../../src/types/purchaseRequest.ts`)
- Create: `scripts/purchase-request-tests/run.ts`, `scripts/purchase-request-tests/domain-test.ts`
- Modify: `package.json` — add `"test:purchase-requests": "npx tsc -p scripts/purchase-request-tests/tsconfig.json && node tmp/purchase-request-tests/out/scripts/purchase-request-tests/run.js"`

**Interfaces — Produces (`src/types/purchaseRequest.ts`):**
```ts
export type PrStoredStatus = "DRAFT" | "SUBMITTED" | "CANCELLED";
export type PrStatus = "DRAFT" | "OPEN" | "PARTIAL" | "COMPLETED" | "CANCELLED";
export const PR_STATUS_LABELS: Record<PrStatus, string>; // OPEN "Open", PARTIAL "Partially handled", COMPLETED "Completed", DRAFT "Draft", CANCELLED "Cancelled"

export interface PurchaseRequest {
  prId: string; prNo: string; status: PrStoredStatus;
  salesOrderId: string; salesOrderNoSnapshot: string; customerNameSnapshot: string;
  quotationNoSnapshot: string; deliveryAddressSnapshot: string;
  requestedByUserId: string; requestedByName: string; requestedDate: string;
  neededByDate: string; purpose: string; cancelReason: string; version: number;
  createdAt: string; createdBy: string; updatedAt: string; updatedBy: string;
}
export interface PurchaseRequestItem {
  prItemId: string; prId: string; lineNo: number;
  productId: string; productCodeSnapshot: string; productNameSnapshot: string;
  unitId: string; unitSnapshot: string; quantity: number;
  salesOrderItemId: string; remarks: string;
  fromStockQty: number; fromStockNote: string; fromStockBy: string; fromStockAt: string;
  cancelledQty: number; cancelReason: string; cancelledBy: string; cancelledAt: string;
  createdAt: string; createdBy: string; updatedAt: string; updatedBy: string;
}
export interface PurchaseRequestLink {
  linkId: string; poNumber: string; poItemNo: number; prId: string; prItemId: string;
  quantity: number; createdAt: string; createdBy: string;
}
export interface PrLineProgress {
  prItemId: string; quantity: number;
  orderedQty: number;      // links on POs not in draft/cancelled/deleted
  onDraftQty: number;      // links on draft POs
  fromStockQty: number; cancelledQty: number;
  remaining: number;       // quantity - ordered - fromStock - cancelled, floored at 0
  claimable: number;       // remaining - onDraftQty, floored at 0
  poNumbers: string[];     // distinct, any counting status, sorted
}
export interface PoLineLinkInput { prItemId: string; quantity: number }
```
Also add to `src/types/purchaseOrder.ts`: `prLinks?: PoLineLinkInput[]` on `PurchaseOrderItem`.

**Interfaces — Produces (`src/lib/purchaseRequests/domain.ts`):**
```ts
export const NON_ORDERED_PO_STATUSES: ReadonlySet<string>; // "draft","cancelled","deleted"
export function formatPrNo(year: string, n: number): string;
export function nextPrNo(existing: string[], date: string): string;
export function deriveLineProgress(item: PurchaseRequestItem, links: PurchaseRequestLink[], poStatus: ReadonlyMap<string, string>): PrLineProgress;
export function derivePrStatus(pr: Pick<PurchaseRequest, "status">, lines: PrLineProgress[]): PrStatus;
export function isPrLocked(lines: PrLineProgress[], links: PurchaseRequestLink[]): boolean; // any link (any PO status) or fromStock>0 or cancelled>0
export function validatePoLinks(input: {
  poNumber: string;                    // the PO being saved (its own existing links are excluded from claims)
  items: { itemNo: number; productId?: string; quantity: number; prLinks?: PoLineLinkInput[] }[];
  prItems: PurchaseRequestItem[]; prs: PurchaseRequest[];
  allLinks: PurchaseRequestLink[]; poStatus: ReadonlyMap<string, string>;
}): string[]; // empty = valid; messages name PR no. + product
export function validateFromStock(progress: PrLineProgress, qty: number): string | null;
export function validateCancelRemaining(progress: PrLineProgress, qty: number, reason: string): string | null;
```
Status links on missing POs (not in the map) count as non-ordered and non-draft (ignored).

- [ ] **Step 1: Write failing tests** in `domain-test.ts` (node:assert/strict), at least:
  - `formatPrNo("2026", 1) === "AIC-PR-2026-0001"`; `nextPrNo(["AIC-PR-2026-0007","AIC-PR-2025-0099"], "2026-11-21") === "AIC-PR-2026-0008"`; `nextPrNo([], "2027-01-02") === "AIC-PR-2027-0001"`.
  - Progress: item qty 10, links 4 on `created` PO-A, 3 on `draft` PO-B, 5 on `cancelled` PO-C, 2 on `deleted` PO-D, fromStock 1 → `orderedQty 4, onDraftQty 3, remaining 5, claimable 2, poNumbers ["PO-A"]`.
  - Over-handled floors: qty 2, ordered 2, fromStock 1 → `remaining 0`, `claimable 0`.
  - `derivePrStatus`: stored DRAFT → DRAFT; stored CANCELLED → CANCELLED; SUBMITTED with no handling → OPEN; some handled → PARTIAL; every line remaining 0 with ≥1 ordered/fromStock → COMPLETED; every line fully cancelled and nothing ordered/fromStock → CANCELLED.
  - `validatePoLinks`: link qty > claimable → error; claimable computed excluding the saving PO's own existing links (re-saving the same draft with the same qty is valid); a second draft PO claiming qty already on another draft → error; link to a CANCELLED or DRAFT PR → error; product mismatch (PO line productId ≠ PR line productId) → error; PO line quantity 3 with links summing 5 → error; merged line with links from two PRs summing ≤ line qty → valid.
  - `validateFromStock`: qty ≤ 0 or > claimable → message; valid → null. `validateCancelRemaining`: empty reason → message; qty > claimable → message.
- [ ] **Step 2: Run** `npm run test:purchase-requests` — Expected: FAIL (module not found).
- [ ] **Step 3: Implement** the types and domain functions above. `nextPrNo` mirrors `nextTransferNo` in `src/lib/inventory/sheets.ts:182`.
- [ ] **Step 4: Run** `npm run test:purchase-requests` — Expected: PASS, prints "All purchase-request focused tests passed."
- [ ] **Step 5: Commit** `feat(pr): purchase request types and domain rules`

### Task 2: Sheets setup and sheets layer

**Files:**
- Create: `scripts/setup-purchase-request-sheets.mjs` (copy structure of `scripts/setup-inventory-sheets.mjs`; audit by default, `--apply` creates tabs/headers; no NEW_COLUMNS)
- Modify: `package.json` — `"setup:purchase-requests": "node --env-file=.env.local scripts/setup-purchase-request-sheets.mjs"`
- Create: `src/lib/purchaseRequests/sheets.ts`

**Headers (exact, row 1):**
- `PurchaseRequests` A:S — PrId, PrNo, Status, SalesOrderId, SalesOrderNo, CustomerName, QuotationNo, DeliveryAddress, RequestedByUserId, RequestedByName, RequestedDate, NeededByDate, Purpose, CancelReason, Version, CreatedAt, CreatedBy, UpdatedAt, UpdatedBy
- `PurchaseRequestItems` A:X — PrItemId, PrId, LineNo, ProductId, ProductCode, ProductName, UnitId, Unit, Quantity, SalesOrderItemId, Remarks, FromStockQty, FromStockNote, FromStockBy, FromStockAt, CancelledQty, CancelReason, CancelledBy, CancelledAt, CreatedAt, CreatedBy, UpdatedAt, UpdatedBy
- `PurchaseRequestLinks` A:H — LinkId, PoNumber, PoItemNo, PrId, PrItemId, Quantity, CreatedAt, CreatedBy

Export the same header map as `PURCHASE_REQUEST_SHEET_HEADERS` from `sheets.ts` and keep the script's copy identical.

**Interfaces — Produces (`src/lib/purchaseRequests/sheets.ts`):**
```ts
export async function readPurchaseRequestSnapshot(): Promise<{ prs: PurchaseRequest[]; items: PurchaseRequestItem[]; links: PurchaseRequestLink[] }>; // one batchGet
export async function savePurchaseRequestRow(pr: PurchaseRequest): Promise<void>;          // insert or update by PrId
export async function replacePurchaseRequestItems(prId: string, items: PurchaseRequestItem[]): Promise<void>; // replaceChildRowsInPlace
export async function updatePurchaseRequestItemRow(item: PurchaseRequestItem): Promise<void>; // single row by PrItemId
export async function replaceLinksForPurchaseOrder(poNumber: string, links: Omit<PurchaseRequestLink, "linkId">[]): Promise<void>; // replaceChildRowsInPlace, new linkIds via nextStableId("PRL", …)
export async function renameLinksPurchaseOrder(fromPoNumber: string, toPoNumber: string): Promise<void>;
```
IDs: `nextStableId("PR", …)`, `nextStableId("PRI", …)`. Missing tab → readers return empty arrays; writers throw `"Purchase request sheets are not set up. Run npm run setup:purchase-requests -- --apply."` (pattern: `NOT_SET_UP` in `src/lib/inventory/sheets.ts`).

- [ ] **Step 1:** Write the setup script; run `npm run setup:purchase-requests` — Expected: reports 3 missing tabs. Run with `-- --apply`, then again without — Expected: "nothing to do".
- [ ] **Step 2:** Implement `sheets.ts` with row↔object mappers (numbers via `parseSheetNumber`).
- [ ] **Step 3:** Run `npx tsc --noEmit -p .` — Expected: no new errors.
- [ ] **Step 4: Commit** `feat(pr): purchase request sheets and setup script`

### Task 3: PR service and API routes

**Files:**
- Create: `src/lib/purchaseRequests/service.ts`
- Create: `src/app/api/purchase-requests/route.ts` (GET list, POST create)
- Create: `src/app/api/purchase-requests/[id]/route.ts` (GET detail, PUT update draft/unlocked, DELETE not provided)
- Create: `src/app/api/purchase-requests/[id]/submit/route.ts`, `.../[id]/cancel/route.ts`
- Create: `src/app/api/purchase-requests/items/[itemId]/from-stock/route.ts` (POST mark `{qty, note}`, DELETE undo)
- Create: `src/app/api/purchase-requests/items/[itemId]/cancel/route.ts` (POST `{qty, reason}`)
- Create: `src/app/api/purchase-requests/sales-orders/route.ts` (GET eligible SOs)
- Create: `src/app/api/purchase-requests/open-lines/route.ts` (GET for the PO picker)

Every route: `requireAuthenticatedSession()`; errors with `status` 4xx are returned as `{ error }` (pattern: `src/lib/inventory/http.ts`). Wrap every write in `withInventoryLock` (`src/lib/inventory/lock.ts`) — reusing that lock is deliberate (one cross-instance lock; PR/PO-link writes are rare and short).

**Interfaces — Produces (`service.ts`):**
```ts
export interface PrView extends PurchaseRequest { derivedStatus: PrStatus; salesOrderStatus: string; lines: (PurchaseRequestItem & PrLineProgress)[]; poNumbers: string[]; locked: boolean }
export async function listPurchaseRequests(session: SessionUser): Promise<PrView[]>; // one PR snapshot + PO summaries + SO list snapshot; DRAFT PRs only returned to their requester or Admin
export async function getPurchaseRequest(prId: string): Promise<PrView>;
export interface PrDraftInput { salesOrderId: string; neededByDate: string; purpose: string; items: { productId: string; quantity: number; salesOrderItemId?: string; remarks?: string }[] }
export async function createPurchaseRequest(input: PrDraftInput, session: SessionUser): Promise<PrView>;       // stored DRAFT
export async function updatePurchaseRequest(prId: string, input: PrDraftInput, session: SessionUser): Promise<PrView>;
export async function submitPurchaseRequest(prId: string, session: SessionUser): Promise<PrView>;  // assigns PrNo, SUBMITTED
export async function cancelPurchaseRequest(prId: string, reason: string, session: SessionUser): Promise<PrView>;
export async function markFromStock(prItemId: string, qty: number, note: string, session: SessionUser): Promise<PrView>; // adds to fromStockQty
export async function undoFromStock(prItemId: string, session: SessionUser): Promise<PrView>;   // zeroes from-stock fields
export async function cancelRemaining(prItemId: string, qty: number, reason: string, session: SessionUser): Promise<PrView>; // adds to cancelledQty
export interface EligibleSalesOrder { salesOrderId: string; salesOrderNo: string; customerName: string; quotationNo: string; deliveryAddress: string; lines: { salesOrderItemId: string; lineNo: number; productId: string; productCode: string; productName: string; unitId: string; unit: string; quantity: number | null }[] }
export async function listEligibleSalesOrders(): Promise<EligibleSalesOrder[]>; // CONFIRMED only, PRODUCT lines with lineStatus ACTIVE, from readSalesOrderListSnapshot()
export interface OpenPrLine { prId: string; prNo: string; prItemId: string; salesOrderNo: string; productId: string; productCode: string; productName: string; unit: string; claimable: number; salesOrderStatus: string }
export async function listOpenPrLines(excludePoNumber?: string): Promise<OpenPrLine[]>; // SUBMITTED PRs, claimable>0, claims excluding that PO's own links
```
Rules enforced here (HTTP 400/403/409 via thrown errors with `status`):
- Create/update/submit: SO must exist and be CONFIRMED (submit re-checks — Review Focus 5); ≥1 item; each product exists and is active; qty > 0. Snapshots (SO no., customer, quotation no., delivery address, product code/name, unit) are taken from the server, never the client.
- Update/cancel PR: requester (`requestedByUserId === session.userId`) or `isAdminRole(session.userRoleId)` → else 403; `isPrLocked` → 409 "This PR already has POs or stock marks and can no longer be edited."
- `PrView.salesOrderStatus` comes from the SO snapshot so the UI can badge non-CONFIRMED.
- `version` increments on every header write; PUT accepts `version` and returns 409 on mismatch.

- [ ] **Step 1:** Implement `service.ts` using Task 1 domain + Task 2 sheets + `getPurchaseOrders()` (map `poNumber → status`) + `readSalesOrderListSnapshot()` + `getProducts()`.
- [ ] **Step 2:** Implement routes (check the Next 16 route-handler docs for `params` being a Promise).
- [ ] **Step 3: Verify** with the dev server and Postman CLI or curl as a logged-in session: create draft → submit returns `prNo` `AIC-PR-2026-0001`; second submit → `-0002`; mark from stock on a line → `derivedStatus` PARTIAL; submit against a non-CONFIRMED SO → 400.
- [ ] **Step 4:** `npx tsc --noEmit -p .` and `npm run lint` — Expected: no new errors.
- [ ] **Step 5: Commit** `feat(pr): purchase request service and API`

### Task 4: PO integration (links, validation, derived PR#)

**Files:**
- Modify: `src/lib/purchaseOrderSheets.ts` — `processPurchaseOrder` (~L226–316), `updatePurchaseOrder` (~L318–480, both rename sites ~L410 and ~L440, items replace ~L445), `getPurchaseOrders` (~L156)
- Modify: `src/components/purchase-order-print-document.tsx` — none needed if `prNumber` is filled server-side (verify)
- Create: `scripts/purchase-request-tests/po-links-test.ts` (pure: tests `buildLinkRows`), add to `run.ts`

**Interfaces:**
- Consumes: `validatePoLinks`, `readPurchaseRequestSnapshot`, `replaceLinksForPurchaseOrder`, `renameLinksPurchaseOrder`.
- Produces (in `src/lib/purchaseRequests/domain.ts`): `export function buildLinkRows(poNumber: string, items: { prLinks?: PoLineLinkInput[] }[], prItems: PurchaseRequestItem[], actor: string, now: string): Omit<PurchaseRequestLink, "linkId">[]` — `poItemNo = index + 1` (matches `replacePurchaseOrderItems`), `prId` looked up from `prItems`.
- Produces: `PurchaseOrderSummary.prNumber` and `PurchaseOrderResponse.prNumber` become derived: when the PO has links, comma-joined distinct PR numbers sorted ascending; otherwise the stored free-text column (back-compat).
- Produces: `PurchaseOrderSummary.items[n].prLinks` populated from link rows (so the edit form can show/keep them).

Behaviour:
- Inside `withInventoryLock`: on create and on any update that includes `items`, read the PR snapshot + PO statuses, run `validatePoLinks` (throw 400 with joined messages if non-empty), save items, then `replaceLinksForPurchaseOrder(effectivePONumber, buildLinkRows(...))`. An update without `items` leaves links alone.
- Wherever `renamePurchaseOrderItemReferences(from, to)` is called, also call `renameLinksPurchaseOrder(from, to)` (Review Focus 1).
- Status changes/cancel/delete need no link writes (derivation handles them — Review Focus 3).

- [ ] **Step 1: Write failing test** `po-links-test.ts`: `buildLinkRows("PO-1", [{prLinks:[{prItemId:"PRI000001",quantity:2}]},{},{prLinks:[{prItemId:"PRI000002",quantity:1},{prItemId:"PRI000003",quantity:4}]}], prItems, "u1", "t")` → 3 rows with `poItemNo` 1, 3, 3 and correct `prId`s.
- [ ] **Step 2: Run** `npm run test:purchase-requests` — Expected: FAIL.
- [ ] **Step 3: Implement** `buildLinkRows` and the PO-sheets changes above.
- [ ] **Step 4: Run** tests — Expected: PASS. Then manual check on dev server via API: create a draft PO with a link → PR line `onDraftQty` set, `derivedStatus` OPEN; finalize the draft → `poNumbers` shows the real PO no. and PR becomes PARTIAL/COMPLETED (**finalize renames links**); edit the PO removing that line → PR back to OPEN; set PO line qty below linked qty → 400 message; cancel the PO → PR reopens; existing PO without links still saves and prints with its typed PR#.
- [ ] **Step 5:** `npm run test:purchase-order-numbering` — Expected: PASS (unchanged behaviour).
- [ ] **Step 6: Commit** `feat(pr): link purchase order lines to purchase request lines`

### Task 5: PR register page, form, and sidebar

**Files:**
- Create: `src/app/dashboard/purchase-requests/page.tsx`
- Create: `src/components/purchase-requests/purchase-request-form.tsx`
- Modify: `src/components/app-sidebar.tsx` — add "Purchase Requests" (lucide `ClipboardList`) directly above "Purchase Orders" (~L378)

Follow `src/app/dashboard/purchase-orders/page.tsx` patterns: `DocumentRegisterHeader` with status cards (Total, Draft, Open, Partially handled, Completed, Cancelled — counts by `derivedStatus`), search over PR no./SO no./customer/requester/product names, filters: Sales Order, requester, requested-date range; table columns: PR No. (or "Draft"), Date, SO No., Customer, Requested by, Needed by, Lines, Status badge, and an amber "SO On hold/Cancelled/Closed" badge when `salesOrderStatus !== "CONFIRMED"`. Row actions: View, Edit (only when `!locked` and requester/Admin), Print (submitted only), Cancel PR (same rule as Edit). Mobile: use the opt-in EntityTable mobile list pattern used by product units.

Form (modal, create/edit): Sales Order select (from `/api/purchase-requests/sales-orders`) → read-only Customer, Quotation No., Delivery address; Requested by (session name, read-only); Needed by (date, optional); Purpose / Job notes (textarea); lines: product combobox (active products), qty, unit (read-only from product), "For SO line" optional select of the chosen SO's lines, remarks. Buttons "Add from Sales Order" (checklist of SO product lines → adds lines with SO qty, editable) and "Add product". Footer: Save draft, Submit. Client-side: qty > 0, ≥1 line, SO chosen; server errors shown via `toast.error`.

- [ ] **Step 1:** Implement page, form, sidebar entry.
- [ ] **Step 2: Verify** in the browser (use the `run` skill): create a draft with one SO line + one extra product, submit, see it under Open with its number; badge appears after putting that SO On Hold; Edit hidden once a line is marked from stock.
- [ ] **Step 3:** `npx tsc --noEmit -p .`, `npm run lint` — no new errors.
- [ ] **Step 4: Commit** `feat(pr): purchase request register and form`

### Task 6: PR detail view and line actions

**Files:**
- Create: `src/components/purchase-requests/purchase-request-detail-dialog.tsx`
- Modify: `src/app/dashboard/purchase-requests/page.tsx` (wire View)

Detail shows header fields, SO-status badge, and a lines table: Product, For (SO line name), Requested, Ordered (with PO numbers), On draft PO, From stock (note), Cancelled (reason), Remaining. Per-line actions when `claimable > 0`: **Mark from stock** (qty default = claimable, note) and **Cancel remaining** (qty default = claimable, reason required). **Undo from stock** when `fromStockQty > 0`. After each action refresh the PR from the response.

- [ ] **Step 1:** Implement dialog and actions.
- [ ] **Step 2: Verify** in browser: mark 2 of 5 from stock → Remaining 3, status Partially handled; undo → back to Open; cancel remaining 3 after 2 from stock → Completed.
- [ ] **Step 3: Commit** `feat(pr): purchase request detail and line actions`

### Task 7: A4 print

**Files:**
- Create: `src/components/purchase-request-print-document.tsx`
- Create: `src/components/purchase-request-preview-modal.tsx`
- Modify: `src/app/dashboard/purchase-requests/page.tsx` (wire Print)

Mirror `purchase-order-print-document.tsx` + `purchase-order-preview-modal.tsx` (same `BusinessDocumentHeader`, `BusinessDocumentPrintFrame`, CSS classes). Content: title "PURCHASE REQUEST", number = prNo; details: Date requested, Needed by, Sales Order No., Quotation No., Customer, Delivery address, Purpose; table columns `#`, Code, Description, Qty, Unit, For, Remarks (colgroup widths 5/14/33/8/8/16/16); summary "End of items · N line items"; signatures **Requested by** (requestedByName, with `UserSignatureImage`) and **Received by** (blank); "Signature over printed name". Browser print only — no Drive PDF save (not in spec).

- [ ] **Step 1:** Implement print document and preview modal.
- [ ] **Step 2: Verify** print preview at A4 with 1 line and with 25 lines (header repeats on page 2, same as PO).
- [ ] **Step 3: Commit** `feat(pr): A4 purchase request print`

### Task 8: PO form "Add from Purchase Requests" picker

**Files:**
- Create: `src/components/purchase-requests/pr-line-picker.tsx`
- Modify: `src/app/dashboard/purchase-orders/page.tsx` — create form (~L1052–1200) and edit form (~L1384–1470): add picker button next to the items toolbar; keep `prLinks` on each line item state and send them in both create (~L685, ~L745) and edit (~L975) payloads; PR# input becomes read-only showing derived PR numbers when any line has links (editable otherwise).

**Interfaces:**
- Consumes: `GET /api/purchase-requests/open-lines?excludePo=<poNumber>` → `OpenPrLine[]`.
- Produces: `PrLinePicker` props `{ open: boolean; onOpenChange(v: boolean): void; excludePoNumber?: string; onAdd(lines: { productId: string; quantity: number; prLinks: PoLineLinkInput[] }[]): void }`.

Picker: table of open lines filterable by PR no., SO no., product; checkbox + qty (default claimable, max claimable) per row; SO-status badge per row. On add: lines with the same `productId` are merged into one PO line (qty = sum, `prLinks` = each), and merged into an existing PO line of the same product if present (adds to its qty and links). Each new PO line resolves supplier product/price the same way the form does when a product is picked manually; a product the selected supplier doesn't offer shows the form's existing warning. Each PO line with links shows a small "PR: AIC-PR-…" chip with a remove-link action. Reducing a linked line's qty below its links is blocked client-side with the same message as the server.

- [ ] **Step 1:** Implement picker and form wiring.
- [ ] **Step 2: Verify** in browser: two PRs each requesting the same filter → picker merges to one PO line with two chips; save as draft → both PRs show "On draft PO"; finalize → both Partially handled/Completed; printed PO shows both PR numbers; remove a chip and save → that PR reopens.
- [ ] **Step 3:** `npx tsc --noEmit -p .`, `npm run lint`.
- [ ] **Step 4: Commit** `feat(pr): add purchase request lines to purchase orders`

### Task 9: Final verification and handoff

- [ ] **Step 1:** `npm run test:purchase-requests && npm run test:purchase-order-numbering && npm run test:sales-orders && npm run test:inventory` — all PASS.
- [ ] **Step 2:** `npm run build` — succeeds.
- [ ] **Step 3:** Walk the Review Focus list end-to-end in the browser once more.
- [ ] **Step 4:** Update spec status to "Implemented", refresh `C:\Users\chris\KOS\02 - Projects\Active\AIC\handoff.md` (replace, don't append), note `npm run setup:purchase-requests -- --apply` is required before deploy.
- [ ] **Step 5: Commit** `docs(pr): mark purchase requests implemented`
