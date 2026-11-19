# Inventory (Stock On Hand per Warehouse) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Track on-hand stock per product per warehouse: manual stock entries and transfers in, DRs out, with block / safety-stock approval rules on every DR and transfer.

**Architecture:** A pure domain module (`src/lib/inventory/domain.ts`) computes balances from three inputs (stock movements, counted DR lines, safety stock) and classifies requested lines as ok / needs approval / blocked. A Sheets layer reads and writes the new tabs. A service layer runs every stock-reducing write inside one Sheets-based write lock. DR create and update paths call the service. Pending-approval DRs behave like drafts. UI: Inventory, Stock Transfers and Approvals pages, DR form warehouse + hints, category switch.

**Tech Stack:** Next.js 16 (read `node_modules/next/dist/docs/` before touching routes/pages), React, Google Sheets API, `date-fns` v4, Node `assert` tests compiled with `tsc` (same pattern as `scripts/delivery-release-tests`).

**Spec:** `docs/superpowers/specs/2026-11-19-inventory-design.md`

## Global Constraints

- Counted DR statuses: `created`, `printed`, `completed` (case-insensitive, trimmed). Everything else (`draft`, `pending_approval`, `rejected`, `cancelled`, `deleted`, `void`, blank-but-not-default) is not counted. A blank DR status reads as `created` (existing behaviour in `getDeliveryReceipts`).
- `available = onHand − safetyStock`. qty ≤ available → ok. available < qty ≤ onHand → needs_approval. qty > onHand → blocked. Blocked has no override.
- A tracked product with no OPENING movement at a warehouse has onHand 0. Only DRs/movements dated ≥ that pair's opening date count. Dates compare as `YYYY-MM-DD`; sheet dates may read back as `M/D/YYYY`.
- One active OPENING per warehouse+product. Tracked-product documents dated before the pair's opening date are refused.
- Only products whose category has `TrackInventory = TRUE` are checked or shown. Lines without `productId` are never checked.
- Access by position title (normalise: trim, lower-case, collapse whitespace/hyphens): **manage** = Super Admin, or the title contains `manager`, or `isExecutivePositionTitle(title)`. **operate** = title `staff` or `tech admin`. **view** = everyone else.
  - view: read inventory, history, transfers, approvals list.
  - operate: + entries `OPENING`, `RECEIVED`, `RETURN`; create/cancel transfers.
  - manage: + `ADJUSTMENT`, void entries, set safety stock, approve/reject.
- A manage-level user's own save that needs approval goes straight to `created`, stamped `ApprovedBy = their userId`, `ApprovalNote = "Self-approved (Manager)"`.
- Pending/rejected DRs act like drafts: negative placeholder DR number, no handover, no SO fulfillment, no PDF, no contract release, not printable.
- New sheets (database spreadsheet): `StockMovements`, `StockTransfers`, `StockTransferItems`, `SafetyStock`, lock tab `_INVENTORY_WRITE_LOCK`. New columns: `ProductCategories!F` TrackInventory, `DeliveryReceipts!T` WarehouseId, `U` ApprovedBy, `V` ApprovedAt, `W` ApprovalNote. Existing `A:S` writes must keep working untouched, so T–W are written with separate `values.update` calls.
- UI copy: hint `"{onHand} on hand · {safety} safety · {available} available"`. Approval confirm `"Needs approval: uses {n} of {safety} safety stock at {warehouse}"`. Block error `"Not enough stock at {warehouse}: {product} needs {qty}, {onHand} on hand"`.

## Review Focus

1. **Editing a counted DR must not count its own quantity twice.** Example: on hand 5, DR #100 already took 5, and the user edits only the comments. The check must exclude DR #100 and pass. *(Task 1 test `computeBalances excludes the edited source`)*
2. **The same product on two lines of one DR.** Lines of 3 and 4 against 6 on hand must be blocked, because the check sums per product before classifying. *(Task 1 test `checkLines sums duplicate products`)*
3. **Sneaking past approval by asking for a counted status.** A non-manager's `printed`, or a pending DR edited to `printed`, must resolve to `pending_approval` whenever safety stock is used. *(Task 1 test `resolveDocumentStatus never lets a non-manager skip approval`)*
4. **Dates and statuses written by Sheets.** `11/19/2026` vs `2026-11-19`, and `Completed` vs `completed `, must compare equal. *(Task 1 tests `toIsoDate handles sheet formats` and `isCountedDrStatus normalises`)*
5. **Untracked or manual lines.** Lines without a productId, products in categories that are switched off, and DRs with no warehouse (historical) never block and never appear in balances. *(Task 1 test `computeBalances ignores untracked and warehouse-less lines`)*

---

### Task 1: Inventory domain helpers (pure)

**Files:**
- Create: `src/lib/inventory/domain.ts` (no `@/` imports. It may import `../deliverySerials.ts` for `parseDeliveryDate` and `../positionUtils.ts`)
- Create: `scripts/inventory-tests/tsconfig.json` (copy `scripts/delivery-release-tests/tsconfig.json`; outDir `../../tmp/inventory-tests/out`; include `*.ts`, `../../src/lib/inventory/domain.ts`, `../../src/lib/deliverySerials.ts`, `../../src/lib/positionUtils.ts`)
- Create: `scripts/inventory-tests/run.ts`, `scripts/inventory-tests/domain-test.ts`
- Modify: `package.json`: add `"test:inventory": "npx tsc -p scripts/inventory-tests/tsconfig.json && node tmp/inventory-tests/out/scripts/inventory-tests/run.js"`

**Interfaces (Produces, all exported from `domain.ts`):**
```ts
export type MovementType = "OPENING" | "RECEIVED" | "RETURN" | "ADJUSTMENT" | "TRANSFER_OUT" | "TRANSFER_IN";
export type AccessLevel = "view" | "operate" | "manage";
export type LineResult = "ok" | "needs_approval" | "blocked";
export interface StockMovement { movementId: string; date: string; warehouseId: string; productId: string; qty: number; type: MovementType; sourceType: "ENTRY" | "TRANSFER"; sourceId: string; referenceNo: string; note: string; status: "active" | "void"; createdBy: string; createdAt: string }
export interface DrStockLine { drNumber: number; date: string; status: string; warehouseId: string; productId: string; quantity: number }
export interface SafetyStockRow { warehouseId: string; productId: string; qty: number }
export interface StockBalance { warehouseId: string; productId: string; openingDate: string | null; onHand: number; safetyStock: number; available: number }
export interface LineCheck { productId: string; requested: number; onHand: number; safetyStock: number; available: number; result: LineResult; safetyUsed: number; shortfall: number }
export interface StockCheck { result: LineResult; lines: LineCheck[] }
export const COUNTED_DR_STATUSES: readonly string[]; // ["created","printed","completed"]
export function isCountedDrStatus(status: string): boolean;
export function toIsoDate(raw: string): string | null; // via parseDeliveryDate, formatted yyyy-MM-dd
export function stockKey(warehouseId: string, productId: string): string; // `${w}|${p}`
export function computeBalances(input: { movements: StockMovement[]; drLines: DrStockLine[]; safety: SafetyStockRow[]; trackedProductIds: ReadonlySet<string>; exclude?: { drNumber?: number; transferId?: string } }): Map<string, StockBalance>;
export function checkLines(balances: Map<string, StockBalance>, warehouseId: string, lines: { productId?: string; quantity: number }[], trackedProductIds: ReadonlySet<string>): StockCheck;
export function resolveDocumentStatus(input: { requested: string; check: StockCheck; level: AccessLevel }): { status: string; selfApproved: boolean } | { error: string };
export function accessLevelFor(input: { positionTitle: string; superAdmin: boolean }): AccessLevel;
export function canPerform(level: AccessLevel, action: "entry:OPENING" | "entry:RECEIVED" | "entry:RETURN" | "entry:ADJUSTMENT" | "entry:void" | "safety:set" | "transfer:create" | "transfer:cancel" | "approval:decide"): boolean;
export function dateBeforeOpening(balances: Map<string, StockBalance>, warehouseId: string, productId: string, date: string): boolean;
```

- [ ] **Step 1: Write failing tests** in `domain-test.ts` (`node:assert/strict`). Fixture: tracked `{P1, P2}`. OPENING P1@W1 qty 10, date `2026-11-20`. Safety P1@W1 = 4.
  - `isCountedDrStatus normalises`: `" Completed"` → true, `"printed"` → true, `"pending_approval"`, `"draft"`, `"cancelled"` → false.
  - `toIsoDate handles sheet formats`: `"11/19/2026"` and `"2026-11-19"` → `"2026-11-19"`. `"x"` → null.
  - `computeBalances basic`: DR #1 (`created`, W1, P1, 3, `2026-11-21`) gives onHand 7, safety 4, available 3. The same DR as `draft` gives onHand 10. Dated `2026-11-19` (before the opening) it gives 10. A `void` RECEIVED +5 is ignored. TRANSFER_OUT −2 gives 8.
  - `computeBalances excludes the edited source`: DR #1 takes 10, and `exclude: { drNumber: 1 }` gives onHand 10. A transfer's movements are excluded by `transferId`.
  - `computeBalances ignores untracked and warehouse-less lines`: a DR line for P3 (untracked), a line with `warehouseId: ""` and a line with `productId: ""` change nothing and add no keys.
  - P2@W1 with no opening: `checkLines` qty 1 → blocked, onHand 0.
  - `checkLines`: with onHand 10 and safety 4, qty 6 → ok. Qty 8 → needs_approval, safetyUsed 2. Qty 11 → blocked, shortfall 1. The overall result is the worst line. A line without a productId is skipped.
  - `checkLines sums duplicate products`: P1 lines of 3 and 4 against onHand 6, safety 0 → blocked.
  - `resolveDocumentStatus never lets a non-manager skip approval`: requested `printed` + needs_approval + operate → `{status:"pending_approval", selfApproved:false}`. Same with manage → `{status:"printed", selfApproved:true}`. Blocked → `{error}` for every level. Requested `draft` → `draft` whatever the check result. ok → the requested status unchanged.
  - `accessLevelFor`: `"Sales Manager"` → manage, `"GM"` → manage, `"Tech-Admin"` → operate, `"Staff"` → operate, `"Technician"` → view, `"Supervisor"` → view, superAdmin with `"Technician"` → manage.
  - `canPerform`: operate cannot do `entry:ADJUSTMENT`, `safety:set` or `approval:decide`, and can do `transfer:create`. View can do nothing.
  - `dateBeforeOpening`: P1@W1 `2026-11-19` → true, `2026-11-20` → false. A pair with no opening → false.
- [ ] **Step 2:** Run `npm run test:inventory`. Expected: the compile fails because `domain.ts` is missing.
- [ ] **Step 3: Implement `domain.ts`.** Balances: for each tracked pair with an active OPENING, onHand = Σ active movements dated ≥ opening + (−Σ counted DR lines dated ≥ opening, with warehouse and productId present). A pair with movements but no opening is still created, with `openingDate: null` and onHand 0, so that checks see 0. `checkLines` aggregates requested qty per productId first.
- [ ] **Step 4:** Run `npm run test:inventory`. Expected: PASS (`All inventory focused tests passed.`).
- [ ] **Step 5: Commit:** `feat: inventory domain helpers`

### Task 2: Sheets layer, write lock, sheet setup

**Files:**
- Create: `src/lib/inventory/sheets.ts`
- Create: `src/lib/sheetWriteLock.ts`: extract the body of `withFTIWriteLock` into `createSheetWriteLock(title: string): { withLock<T>(work: () => Promise<T>): Promise<T>; isLocked(): boolean }`
- Modify: `src/lib/ftiWriteLock.ts`: re-implement its exports on top of `createSheetWriteLock(FTI_LOCK_SHEET)` with identical names, signatures and error class. **If `npm run test:fti` reads the file's source or internals and fails, revert this and copy the pattern into `src/lib/inventory/lock.ts` instead.**
- Create: `src/lib/inventory/lock.ts`: `export const withInventoryLock = createSheetWriteLock("_INVENTORY_WRITE_LOCK").withLock`
- Create: `scripts/setup-inventory-sheets.mjs` (audit by default, `--apply` creates the missing tabs and header rows). Add `"setup:inventory": "node --env-file=.env.local scripts/setup-inventory-sheets.mjs"` to `package.json`.

**Sheet columns (header row 1, data from row 2):**
- `StockMovements!A:O`: MovementId, Date, WarehouseId, ProductId, Qty, Type, SourceType, SourceId, ReferenceNo, Note, Status, CreatedBy, CreatedAt, UpdatedBy, UpdatedAt. Ids `nextStableId("MOV", …)`.
- `StockTransfers!A:O`: TransferId, TransferNo, Date, FromWarehouseId, ToWarehouseId, Status, PreparedBy, Note, ApprovedBy, ApprovedAt, ApprovalNote, CreatedBy, CreatedAt, UpdatedBy, UpdatedAt. Id `nextStableId("TRF", …)`. TransferNo `ST-{yyyy}-{0001}`, sequential per year.
- `StockTransferItems!A:D`: TransferId, ProductId, Qty, SerialNumbers (`formatSerialCell`).
- `SafetyStock!A:E`: WarehouseId, ProductId, Qty, UpdatedBy, UpdatedAt. Upsert by pair.

**Interfaces (Produces, from `sheets.ts`):**
```ts
export function listMovements(): Promise<StockMovement[]>;
export function appendMovements(rows: Omit<StockMovement, "movementId">[]): Promise<StockMovement[]>;
export function setMovementStatus(movementIds: string[], status: "active" | "void", actor: string): Promise<void>;
export function listSafetyStock(): Promise<SafetyStockRow[]>;
export function upsertSafetyStock(row: SafetyStockRow, actor: string): Promise<void>;
export interface StockTransfer { transferId: string; transferNo: string; date: string; fromWarehouseId: string; toWarehouseId: string; status: "pending_approval" | "created" | "rejected" | "cancelled"; preparedBy: string; note: string; approvedBy: string; approvedAt: string; approvalNote: string; createdBy: string; createdAt: string; items: { productId: string; qty: number; serialNumbers: string[] }[] }
export function listTransfers(): Promise<StockTransfer[]>;
export function saveTransfer(t: Omit<StockTransfer, "transferId" | "transferNo"> & { transferId?: string }): Promise<StockTransfer>; // create or update header + replace items
export function listDrStockLines(): Promise<DrStockLine[]>; // DeliveryReceipts A:W joined with DeliveryReceiptItems (reuse getDeliveryItems from deliverySheets)
export function listTrackedProductIds(): Promise<Set<string>>; // Products joined with ProductCategories.trackInventory
```
Missing tabs read as `[]` (`isMissingSheetError`). Writes to a missing tab throw `"Inventory sheets are not set up. Run npm run setup:inventory -- --apply."`.

- [ ] **Step 1:** Implement `sheetWriteLock.ts` and the FTI refactor. Run `npm run test:fti`. Expected: PASS. Otherwise, take the fallback above.
- [ ] **Step 2:** Implement `sheets.ts`, `lock.ts` and the setup script. Row mapping stays inline in `sheets.ts`, following `productSheets.ts` style.
- [ ] **Step 3:** Run `npx tsc --noEmit -p tsconfig.json`. Expected: no new errors in `src/lib/inventory/**` or `src/lib/*WriteLock.ts`.
- [ ] **Step 4:** Run `npm run setup:inventory` (audit only) against the dev sheet. Expected: it lists the 4 missing tabs and the missing columns. Ask Chris before running `--apply`.
- [ ] **Step 5: Commit:** `feat: inventory sheets, write lock and setup script`

### Task 3: Track inventory switch on product categories

**Files:**
- Modify: `src/types/product-reference.ts`, `src/types/product-category.ts` (`trackInventory?: boolean`)
- Modify: `src/lib/productReferenceSheets.ts`: read/write column F, range `A2:F`, parsed exactly like `requiresSerial`
- Modify: the product-categories API route body passthrough (same place `requiresSerial` is accepted)
- Modify: `src/app/dashboard/product-categories/page.tsx`: "Track inventory" checkbox in the form and a column/badge in the table, mirroring `requiresSerial` at lines 36–42, 52, 85–88, 135, 208 and 260

- [ ] **Step 1:** Implement. Writing the category must preserve E (RequiresSerial).
- [ ] **Step 2: Manual check.** Run `npm run dev`. Toggle the switch on a category, reload, and see that it persisted. RequiresSerial is unchanged.
- [ ] **Step 3: Commit:** `feat: track-inventory switch on product categories`

### Task 4: Inventory service and access

**Files:**
- Create: `src/lib/inventory/access.ts`: `getAccessLevel(session: SessionUser): Promise<AccessLevel>` (resolves the position title with `getPositions()` as in `technicianEarningsAccess.ts`, plus `isSuperAdmin`, then `accessLevelFor`). Also `requireInventoryAction(session, action): Promise<AccessLevel | Response>` (403 JSON `{ error }`).
- Create: `src/lib/inventory/service.ts`

**Interfaces (Produces, from `service.ts`):**
```ts
export function loadBalances(exclude?: { drNumber?: number; transferId?: string }): Promise<{ balances: Map<string, StockBalance>; tracked: Set<string> }>;
export function previewCheck(input: { warehouseId: string; lines: { productId?: string; quantity: number }[]; exclude?: { drNumber?: number; transferId?: string } }): Promise<StockCheck>;
export function createEntries(input: { type: MovementType; warehouseId: string; date: string; referenceNo: string; note: string; lines: { productId: string; qty: number }[] }, actor: { userId: string; level: AccessLevel }): Promise<StockMovement[]>;
export function voidEntry(movementId: string, actor: { userId: string; level: AccessLevel }): Promise<void>;
export function setSafetyStock(row: SafetyStockRow, actor: { userId: string; level: AccessLevel }): Promise<void>;
export function createTransfer(input: { date: string; fromWarehouseId: string; toWarehouseId: string; preparedBy: string; note: string; items: { productId: string; qty: number; serialNumbers: string[] }[] }, actor: { userId: string; level: AccessLevel }): Promise<StockTransfer>;
export function cancelTransfer(transferId: string, actor: { userId: string; level: AccessLevel }): Promise<StockTransfer>;
export function decideTransfer(transferId: string, decision: "approve" | "reject", note: string, actor: { userId: string; level: AccessLevel }): Promise<StockTransfer>;
export function guardDrStock(input: { drNumber?: number; warehouseId: string; date: string; requestedStatus: string; items: { productId?: string; quantity: number }[]; level: AccessLevel }): Promise<{ status: string; selfApproved: boolean; check: StockCheck }>; // throws InventoryBlockedError (status 409) with the block copy
export class InventoryBlockedError extends Error { status: 409; check?: StockCheck }
```
Rules every function enforces (from the spec): `canPerform`. Positive qty, except ADJUSTMENT, which is signed and non-zero with a required note. OPENING refused if an active one already exists for the pair. A tracked product dated before its opening is refused (except the OPENING itself). Any write that lowers a pair (negative adjustment, voiding a positive entry, transfer create/approve on the *from* side, transfer cancel on the *to* side) runs `checkLines` inside `withInventoryLock` and is refused if blocked. Approval outcomes for transfers use `resolveDocumentStatus`. Only `created` transfers write the paired TRANSFER_OUT/IN movements. Cancel voids them. A transfer needs from ≠ to and both warehouses active.

`guardDrStock` also refuses (409) a DR dated before the opening date of any tracked line's pair (`dateBeforeOpening`), and it is skipped entirely when `requestedStatus` is `draft`. It must be called **inside** `withInventoryLock` by its caller (Task 5), because the DR write must happen in the same critical section.

- [ ] **Step 1:** Implement `access.ts` and `service.ts`.
- [ ] **Step 2:** Run `npx tsc --noEmit -p tsconfig.json`. Expected: no new errors.
- [ ] **Step 3: Commit:** `feat: inventory service and access rules`

### Task 5: DR integration (server)

**Files:**
- Modify: `src/types/deliveryReceipt.ts`: `warehouseId?: string` on `CreateDeliveryPayload`, `DeliveryReceiptResponse`, `DeliveryReceiptSummary`, and on `UpdateDeliveryPayload` (in `deliverySheets.ts` ~line 590). Add `approvedBy?`, `approvedAt?`, `approvalNote?` to `DeliveryReceiptSummary`.
- Modify: `src/lib/deliverySheets.ts`
  - The read range for `getDeliveryReceipts` becomes `A2:W`. Map T–W.
  - `processDeliveryReceipt`: treat `pending_approval` exactly like `draft` (`isDraft` covers both: negative number, plain append, no handover, no PDF). After the header append, write `T:W` for the row.
  - `updateDeliveryReceipt`: the draft-promotion rule `drNumber <= 0 && newStatus !== "draft"` must also exclude `pending_approval` and `rejected`. The `commitDocumentWithHandover` exclusion list gains `pending_approval` and `rejected`. Write `T:W` after the `A:S` write (keep the stored value when the payload omits it).
- Modify: `src/app/api/deliveries/route.ts` (POST) and `src/app/api/deliveries/[id]/route.ts` (PUT)
  - A non-draft save requires `warehouseId` that matches an active warehouse (422 `"From warehouse is required."`).
  - Wrap the stock guard and the write in `withInventoryLock`: `guardDrStock({ drNumber (PUT only), warehouseId, date, requestedStatus: body.status ?? stored, items, level: await getAccessLevel(session) })`. Then set `body.status` to the result. If `selfApproved`, set approval fields (`session.userId`, now, `"Self-approved (Manager)"`). Then call `processDeliveryReceipt` / `updateDeliveryReceipt`.
  - PUT: run the guard only when the resulting status is counted (`isCountedDrStatus`). A plain edit of a cancelled/deleted DR skips it.
  - `InventoryBlockedError` → 409 `{ error, check }`.
  - POST: skip SO fulfillment and Drive PDF when the final status is `pending_approval`. The response includes `status` and `check`.
- Create: `src/app/api/inventory/approvals/dr/[id]/route.ts`. POST `{ decision: "approve" | "reject", note }` (`approval:decide`). Approve: inside the lock, `guardDrStock` with `exclude` none and level `manage`, then `updateDeliveryReceipt(..., { status: "created" })`. Then write U–W. If SO-linked and `can("so.fulfill")`, call `postFinalizedDeliveryReleaseFulfillment` (same try/catch pattern as POST). Reject: status `rejected`, write U–W.

- [ ] **Step 1:** Implement.
- [ ] **Step 2:** Run `npm run test:delivery-releases`. Expected: PASS (no regressions in the reference/serial tests).
- [ ] **Step 3:** Run `npx tsc --noEmit -p tsconfig.json`. Expected: no new errors.
- [ ] **Step 4: Commit:** `feat: warehouse, stock guard and approval on delivery receipts`

### Task 6: Inventory API routes

**Files (all under `src/app/api/inventory/`; every handler starts with `requireAuthenticatedSession`, then `requireInventoryAction` for writes):**
- `route.ts` GET → `{ level, balances: StockBalance[] (tracked only, joined with productName/code, categoryName, warehouseName) }`
- `history/route.ts` GET `?warehouseId&productId` → movements + counted DR lines for that pair, newest first: `{ date, type, qty, source: { kind: "ENTRY" | "TRANSFER" | "DR", id, label }, by }`
- `check/route.ts` POST `{ warehouseId, lines, excludeDrNumber? }` → `StockCheck` (used by the DR and transfer forms for hints)
- `entries/route.ts` POST → `createEntries`. `entries/[id]/void/route.ts` POST → `voidEntry`
- `safety-stock/route.ts` PUT → `setSafetyStock`
- `transfers/route.ts` GET/POST. `transfers/[id]/cancel/route.ts` POST
- `approvals/route.ts` GET → pending DRs + pending transfers with their `StockCheck`. `approvals/transfer/[id]/route.ts` POST → `decideTransfer`

- [ ] **Step 1:** Read `node_modules/next/dist/docs/` for route handler conventions in this version (params are a `Promise`, as in the existing routes). Implement.
- [ ] **Step 2:** Run `npx tsc --noEmit -p tsconfig.json`. Expected: no new errors.
- [ ] **Step 3: Commit:** `feat: inventory API routes`

### Task 7: DR form and register UI

**Files:**
- Modify: `src/app/dashboard/delivery-releases/page.tsx`
- Modify: `src/lib/services/delivery.service.ts` (pass `warehouseId`, surface 409 `check`)

Changes:
- Add a required "From warehouse" `Select` (active warehouses from `/api/warehouses`). It is carried through every place that builds the payload or loads a DR for edit (create ~1030, draft ~1110, edit ~1220/~1282, SO prefill ~480).
- Per-line hint under qty for tracked products. Call `/api/inventory/check` (debounced 400 ms, `excludeDrNumber` when editing) and show the hint copy. Blocked lines show red text with the block copy.
- On save: if the check result is `needs_approval` and the user is not manage-level, show a confirm dialog with the approval copy. On confirm, send the normal request (the server decides `pending_approval`). On 409, show the error toast and keep the modal open.
- If the response status is `pending_approval`: toast `"Sent for approval"`, no print/preview, and skip the contract-release loop (~1050).
- Register: `Pending approval` and `Rejected` badges. Hide print/preview actions for those statuses. Status filter cards gain `Pending`.

- [ ] **Step 1:** Implement.
- [ ] **Step 2: Manual check** (`npm run dev`, tracked category, opening 10 + safety 4 at W1). A DR for 6 prints. 8 as Staff → pending, no print. 8 as Manager → prints, with U–W showing "Self-approved (Manager)". 11 → blocked toast. Editing the 6-DR comments saves.
- [ ] **Step 3: Commit:** `feat: warehouse and stock hints on delivery receipt form`

### Task 8: Inventory page and stock entries

**Files:**
- Create: `src/app/dashboard/inventory/page.tsx` (+ local components in `src/components/inventory/`)
- Modify: `src/components/app-sidebar.tsx`: add "Inventory", "Stock Transfers" and "Approvals" under the group that holds Warehouses (~354), visible to everyone

Page:
- Table: Product (code, name), Category, Warehouse, On hand, Safety, Available. Filters: warehouse, category, search. Rows with onHand < 0 or available < 0 are highlighted. Use `EntityTable` with the mobile list pattern.
- Safety cell is inline-editable for manage only (PUT safety-stock).
- Row click opens a history drawer (`/api/inventory/history`) with links to DRs and transfers. Manage users can void an entry row.
- "Add stock entry" button (operate+). The dialog has type (options filtered by `canPerform`), warehouse, date (default today), reference no., note, and a multi-row product + qty grid (tracked products only), so one dialog does a whole warehouse's opening count. Server errors are shown per row.

- [ ] **Step 1:** Implement.
- [ ] **Step 2: Manual check.** Opening count for 3 products in one submit. A second OPENING for the same pair is refused. A Staff user doesn't see Adjustment. A Technician sees no Add button.
- [ ] **Step 3: Commit:** `feat: inventory page and stock entries`

### Task 9: Stock Transfers and Approvals pages

**Files:**
- Create: `src/app/dashboard/stock-transfers/page.tsx`: register (no., date, from → to, items, status) + create dialog (from, to, date, prepared by, note, lines with per-line hints via `/api/inventory/check`, optional serials using `src/components/delivery-serial-input.tsx`) + cancel action (operate+) + print slip (simple A4 page modelled on `delivery-receipt-print-document.tsx`: title "Stock Transfer Slip", no., date, from/to warehouse names and addresses, item table, prepared by / received by lines)
- Create: `src/app/dashboard/inventory-approvals/page.tsx`: list from `/api/inventory/approvals`. Each row shows document, requester, warehouse, and per line what it consumes ("uses 2 of 4 safety"). Approve/Reject buttons with a note, for manage only. Others see the list read-only.

- [ ] **Step 1:** Implement.
- [ ] **Step 2: Manual check.** A transfer W1→W2 of 5 moves stock immediately (W1 −5, W2 +5). A transfer into safety stock as Staff → pending, then a Manager approves → moves. Cancel when W2 has already delivered it → refused. Approving a pending DR assigns a DR number and makes it printable.
- [ ] **Step 3: Commit:** `feat: stock transfers and approvals pages`

### Task 10: Verification

- [ ] **Step 1:** Run `npm run test:inventory && npm run test:delivery-releases && npm run test:fti`. Expected: all PASS.
- [ ] **Step 2:** Run `npm run lint` and `npm run build`. Expected: no new errors.
- [ ] **Step 3:** Run the Task 7 and Task 9 manual checks end to end on one dataset, and confirm the A4 DR print is unchanged.
- [ ] **Step 4:** Refresh `C:\Users\chris\KOS\02 - Projects\Active\AIC\handoff.md`: setup steps (`npm run setup:inventory -- --apply`, switch categories on, enter opening counts as of launch day).
