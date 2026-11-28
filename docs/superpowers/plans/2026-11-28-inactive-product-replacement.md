# Inactive Product Replacement Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let an admin replace a duplicate product with the kept product across every in-progress document in one confirmed action, and show admins a header bell listing in-progress documents that still use inactive products.

**Architecture:** A pure core (`classify.ts`) turns a plain snapshot of the relevant sheets into usage rows and replacement edits. A thin Sheets layer (`sheets.ts`) reads that snapshot in one `batchGet`, applies edits (cell writes, plus the existing Sales Order command writer), and writes an audit record. `service.ts` adds a 5-minute in-memory cache. Three admin API routes, a shared replacement dialog, and a header bell sit on top.

**Tech Stack:** Next.js 16 route handlers, React client components (shadcn/ui), googleapis Sheets v4, and native-TS test runner (`node:assert`) under `scripts/`.

**Spec:** `docs/superpowers/specs/2026-11-28-inactive-product-replacement-design.md`

## Spec adjustments found during planning

- **Proforma Invoices** (items carry only `productName` + `salesOrderItemId`) and **Contract Releases** (reference `contractItemId`) store no product id. They inherit from their Sales Order or contract item and drop out of scope.
- **Purchase Orders:** `draft` is replaceable. `created`/`approved` count as sent (listed, unchanged). `completed`/`cancelled`/`deleted` are finished. A draft line with a `supplierProductId` is swapped only if the same supplier has an active offering for the kept product; otherwise it is listed.
- **Supplier Products** follow the price-list rule: if the supplier already has an active offering for the kept product, deactivate the duplicate's offering; otherwise move it.
- The cache is a module-level TTL cache (the `userSheets.ts` pattern), not the Next cache API. It is a single-instance internal app, and this is simplest.

## Global Constraints

- Admin only: `requireAdminSession()` / `isAdminUser()` from `src/lib/auth/session.ts`.
- Swapped lines change `productId` plus the code/name snapshot columns only. Price, quantity, description and discounts are untouched.
- Never modify Delivery Releases, Service Invoices, Sales Invoices, or finished/cancelled documents.
- Price conflict default: keep the kept product's existing active price and deactivate the duplicate's.
- Cache TTL is 5 minutes, invalidated after any replace or product deactivation.
- Audit tabs: `ProductReplacements` (`ReplacementId, FromProductId, ToProductId, Actor, StartedAt, FinishedAt, Status, Error`) and `ProductReplacementRows` (`ReplacementId, Sheet, RowNumber, Column, OldValue, NewValue, AppliedAt`). Created on first use.
- Bell empty-state copy: "No documents use inactive products."

## Review Focus

1. Replacing with the same product, or with an inactive product, must be rejected (400), not applied.
2. A Sales Order line partially fulfilled must be listed (not swapped). A fully fulfilled or cancelled line is finished (ignored).
3. A contract whose stored status is Active but whose end date has passed (`effectiveContractStatus` → Expired) is finished, not swapped.
4. A partial failure mid-apply must mark the record `partial` and return what was and wasn't applied. It must never report success.
5. Typed (non-catalog) lines with a blank `productId` must never match anything.

---

### Task 1: Pure classifier and edit planner

**Files:**
- Create: `src/lib/productReplacement/types.ts`, `src/lib/productReplacement/classify.ts`
- Test: `scripts/product-replacement-tests/classify-test.ts`, `run.ts`, `tsconfig.json`; add `"test:product-replacement"` to `package.json`

**Interfaces:**
- Produces (types.ts, relative imports only):
  - `ReplacementSnapshot` with plain rows carrying `rowNumber` (sheet row): `products {productId, productCode, productName, status}`, `contracts {id, status, endDate, agreementType?}`, `contractItems {id, contractId, productId, productCode, status, rowNumber}`, `salesOrders {salesOrderId, salesOrderNo, orderStatus, version}`, `salesOrderItems {salesOrderItemId, salesOrderId, lineNo, productId, lineStatus, quantity, fulfilledQty, cancelledQty}`, `purchaseRequests {prId, prNo, status, rowNumber, version}`, `prItems {prItemId, prId, lineNo, productId, quantity, fromStockQty, cancelledQty, rowNumber}`, `prLinks {prItemId}`, `quotations {quotationNo, status}`, `quotationDetails {quotationNo, productId, rowNumber}`, `purchaseOrders {poNumber, status, supplierId}`, `poItems {poNumber, itemNo, productId, supplierProductId, rowNumber}`, `customerPrices {id, customerId, customerName, productId, pricePerUnit, status, rowNumber}`, `supplierProducts {id, supplierId, supplierName, productId, status, rowNumber}`.
  - `UsageDocumentType = "contract" | "salesOrder" | "purchaseRequest" | "quotation" | "purchaseOrder" | "customerPrice" | "supplierProduct"`.
  - `ProductUsage { productId; productCode; productName; documentType; documentId; documentNo; lineLabel; disposition: "replaceable" | "needs_manual"; reason: string; href: string }`.
  - `CellEdit { sheet: string; rowNumber: number; column: string; oldValue: string; newValue: string }`.
  - `ReplacementPlan { from; to; changes: ProductUsage[]; skipped: ProductUsage[]; conflicts: ProductUsage[]; cellEdits: CellEdit[]; salesOrderEdits: { salesOrderId: string; expectedVersion: number; itemIds: string[] }[] }`.
- Produces (classify.ts): `findUsages(snapshot, today: string): ProductUsage[]` (only usages whose product is inactive), `planReplacement(snapshot, fromProductId, toProductId, today, actor, nowIso): ReplacementPlan` (throws `ReplacementInputError` on same/unknown/inactive target).

Rules (one scope table in `classify.ts`):
- contract item: line `Active`, `effectiveContractStatus(contract, today) === "Active"` → replaceable. Edits C (id), D (code).
- SO item: order `DRAFT|CONFIRMED|ON_HOLD`, line `ACTIVE`, `fulfilledQty === 0` → replaceable. `fulfilledQty > 0` and remaining > 0 → needs_manual "partially delivered". Fully done → ignored. Edited via `salesOrderEdits`.
- PR item: PR not CANCELLED/derived not COMPLETED, line remaining > 0, no `prLinks` and `fromStockQty === 0` → replaceable; else if remaining > 0 → needs_manual "already on a PO / taken from stock". Edits D, E, F, V (updatedAt), W (updatedBy), and header O (version + 1), R, S.
- quotation detail: `DRAFT|SAVED` → replaceable (edits B, C). `SENT` → needs_manual "already sent to customer".
- PO item: `draft` → replaceable when no `supplierProductId`, or the supplier has an active offering for the target (edits C to that offering id and D). Otherwise needs_manual "supplier has no offering for the replacement". `created|approved` → needs_manual "already sent to supplier".
- customer price active: if the same customer has an active price on the target → conflict, edits H="inactive", K, L. Otherwise replaceable, edits C.
- supplier product active: same rule (status column I, updated L/M, product column B).
- `findUsages` with an inactive product and no target: every in-progress hit is `needs_manual` with reason "uses inactive product".

- [ ] **Step 1:** Write `classify-test.ts` with a fixture snapshot: products P-OLD inactive, P-NEW active, P-OFF active. Assertions:
  - `planReplacement(s, "P-OLD", "P-OLD")` and `("P-OLD", "P-OFF-INACTIVE")` throw `ReplacementInputError`.
  - Active contract CTR-1 line → change with edits `{sheet:"ContractItems", column:"C", newValue:"P-NEW"}` and `D` = kept code; expired-by-date CTR-2 → absent.
  - SO DRAFT line with `fulfilledQty 0` → in `salesOrderEdits`; CONFIRMED line with `fulfilledQty 1 of 3` → skipped "partially delivered"; CANCELLED order → absent.
  - PR OPEN line without links → change; PR line with a link → skipped.
  - Quotation SAVED → change; SENT → skipped "already sent to customer".
  - PO draft line without supplierProductId → change; created PO → skipped.
  - Customer C1 has prices on both → conflict editing `H` to `"inactive"`; C2 only on old → change editing `C`.
  - Blank-productId typed lines never appear.
  - `findUsages(s, today)` counts only in-progress usages of P-OLD, with all `href`s non-empty.
- [ ] **Step 2:** `npm run test:product-replacement` → FAIL (module missing).
- [ ] **Step 3:** Implement `types.ts` + `classify.ts`.
- [ ] **Step 4:** `npm run test:product-replacement` → "All product-replacement tests passed."
- [ ] **Step 5:** Commit `feat(products): classify inactive product usages and plan replacements`.

### Task 2: Sheets layer, service and API

**Files:**
- Create: `src/lib/productReplacement/sheets.ts`, `src/lib/productReplacement/service.ts`
- Create: `src/app/api/admin/inactive-product-usages/route.ts`, `src/app/api/products/[id]/replacement-preview/route.ts`, `src/app/api/products/[id]/replace/route.ts`
- Modify: `src/app/api/products/[id]/route.ts` (invalidate cache after DELETE)

**Interfaces:**
- Consumes: Task 1 types, `planReplacement`, `findUsages`; `writeSalesOrderCommand`, `readSalesOrderListSnapshot` (salesOrders/repository); `payloadHash`; `getCompanies`.
- Produces: `readReplacementSnapshot(): Promise<{ snapshot: ReplacementSnapshot; salesOrderItems: SalesOrderItem[]; salesOrders: SalesOrder[] }>`; `applyCellEdits(edits: CellEdit[]): Promise<void>`; `ensureAuditTabs()`, `appendAuditHeader(...)`, `appendAuditRows(...)`, `finishAudit(...)`.
- `service.ts`: `getInactiveProductUsages(): Promise<ProductUsage[]>` (cached 5 min), `invalidateUsageCache()`, `previewReplacement(from, to): Promise<ReplacementPlan>`, `applyReplacement(from, to, actor): Promise<ReplacementResult>` where `ReplacementResult = { replacementId; status: "completed" | "partial"; applied: number; skipped: ProductUsage[]; conflicts: ProductUsage[]; error?: string }`.
- API JSON: GET usages → `{ usages: ProductUsage[] }`; GET preview `?to=` → `ReplacementPlan` without `cellEdits`; POST replace `{ toProductId }` → `ReplacementResult`. All 403 for non-admin, 400 for `ReplacementInputError`.

Apply order: re-read snapshot → plan → write audit header (StartedAt, Status `running`) → cell edits in one `batchUpdate` → append audit rows → each SO order via `writeSalesOrderCommand` (`so.update`, `hadItems: true`, `expectedVersion`, history `PRODUCT_REPLACED`) → deactivate `from` if still active (`deactivateProduct`, no customer-price sweep because conflicts already handled) → finish audit `completed`, or `partial` with error → invalidate cache.

- [ ] **Step 1:** Implement `sheets.ts` (one `batchGet` for every non-SO tab; SO via `readSalesOrderListSnapshot`).
- [ ] **Step 2:** Implement `service.ts` and the three routes, following the existing route style (`params: Promise<{id}>`).
- [ ] **Step 3:** `npx tsc --noEmit -p .` → no new errors in the touched files.
- [ ] **Step 4:** Commit `feat(products): replacement service and admin API`.

### Task 3: Replacement dialog + products page

**Files:**
- Create: `src/components/product-replacement-dialog.tsx`, `src/lib/services/product-replacement.service.ts`
- Modify: `src/app/dashboard/products/page.tsx` (delete dialog gets "Replace instead…" for admins)

**Interfaces:**
- `ProductReplacementDialog({ open, fromProduct: {productId, code, name}, products: Product[], onClose, onDone })`: has an active-product `SearchableSelect` (excluding the source), loads the preview on select, shows grouped "Will update (n)", "Skipped — needs your review (n)" and "Price conflicts (n)" lists, and a confirm button "Replace & deactivate" (or "Replace" when the source is already inactive). Toasts the result, and on `partial` shows the error.
- [ ] **Step 1:** Build the service client + dialog.
- [ ] **Step 2:** Wire into the products page delete flow (admin only, read `auth:user` from localStorage like `user-menu.tsx`).
- [ ] **Step 3:** `npx tsc --noEmit -p .` and `npx eslint` on the touched files → clean.
- [ ] **Step 4:** Commit `feat(products): replace duplicate product dialog`.

### Task 4: Header bell

**Files:**
- Create: `src/components/inactive-product-bell.tsx`
- Modify: `src/app/dashboard/layout.tsx` (render before `ThemeToggle`)

**Interfaces:** Consumes the GET usages API. Hidden for non-admins (localStorage role check; the server enforces with a 403). Shows the count of documents (`documentType + documentId`, de-duplicated). A popover lists usages grouped by product, each linking to `href` with its reason and a "Replace…" button that opens `ProductReplacementDialog` for that product. Fetches on mount and when the popover opens. Empty-state copy per Global Constraints.
- [ ] **Step 1:** Build the bell, wire it into the layout.
- [ ] **Step 2:** `npx tsc --noEmit -p .`, `npx eslint` on touched files, `npm run build` → success.
- [ ] **Step 3:** Commit `feat(dashboard): admin bell for documents using inactive products`, merge to main, push.
