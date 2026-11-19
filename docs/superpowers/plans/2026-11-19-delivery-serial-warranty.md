# Delivery Serial Numbers and Warranty Lookup Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Record serial numbers on Delivery Receipt lines, print them, and let staff find a customer's delivered items with warranty status from the Delivery Release register.

**Architecture:** Serials live on the existing `DeliveryReceiptItems` rows (new column K). A pure helper module (`src/lib/deliverySerials.ts`) owns serial parsing, warranty math, the missing-serial rule, word-by-word register search and print-row building; the Sheets layer, API routes and the Delivery Release page consume it. Categories get a `RequiresSerial` column (E) toggled on the Product Categories page.

**Tech Stack:** Next.js 16 (read `node_modules/next/dist/docs/` before touching routes), React, Google Sheets API, `date-fns` v4, Node `assert` test runner under `scripts/delivery-release-tests`.

**Spec:** `docs/superpowers/specs/2026-11-19-delivery-serial-warranty-design.md`

## Global Constraints

- Warranty end = DR delivery date + 1 year (`date-fns` `addYears`; Feb 29 → Feb 28). Under warranty when today ≤ end (inclusive, local date).
- Warranty tag only for lines with ≥ 1 serial, and only on DRs whose status is not `draft`, `cancelled` or `deleted`.
- "Serial missing" flag only for lines whose product's category has `requiresSerial === true` and `serials.length < quantity`. Never blocks save or print.
- Manual lines (no product) never require serials.
- Serial cell format in the sheet: serials joined with `", "`. Blank = no serials.
- `ProductCategories!E` = `TRUE`/`FALSE`; blank = false.
- Tag copy: `Under warranty until MMM d, yyyy`, `Warranty expired MMM d, yyyy`, `Serial missing (n of q)`.
- Print: one extra template row after each item with serials, description cell `S/N: A123, B456`, qty and unit blank. No new row limit.
- Word-by-word search applies to the DR register only; do not change `matchesDocumentSearch`.
- Old DRs are not backfilled.

## Review Focus

1. **Sheets-formatted dates.** `USER_ENTERED` dates may read back as `3/5/2026` or `03/05/2026` instead of `2026-03-05`. Warranty must parse ISO and M/D/YYYY. Anything else gets no tag rather than a wrong one. *(Task 1 test `parseDeliveryDate handles sheet formats`)*
2. **Full DR edit dropping serials.** The edit form rebuilds `LineItem`s explicitly (`page.tsx` ~1220 and ~1282) and the Sales Order prefill builds them too (~480). Each must carry `serialNumbers` through, or a normal edit wipes them. *(Task 5 manual check step)*
3. **Messy serial input.** Trailing commas, blank lines, extra spaces and repeated serials in one line. Trim, drop blanks, dedupe case-insensitively, and keep first-seen order. *(Task 1 test `parseSerialInput cleans input`)*
4. **Legacy item rows.** Rows without column K or without `deliveryReceiptItemId` (column I) must read as `[]`. The serial-only endpoint must reject unknown ids and must not write. *(Task 2 test `parseDeliveryItemRow legacy row`, Task 3 test `validateSerialUpdate rejects unknown id`)*
5. **Customer names with punctuation.** Searching `hcch reprocessing` must match the company `ZODIAC HEALTH VENTURES INC. (HCCH)` combined with an item `Reprocessing Machine`. *(Task 1 test `matchesDeliverySearch word by word`)*

---

### Task 1: Serial and warranty helpers

**Files:**
- Create: `src/lib/deliverySerials.ts`
- Create: `scripts/delivery-release-tests/serials-test.ts`
- Modify: `scripts/delivery-release-tests/run.ts` (import `./serials-test.ts`)
- Modify: `scripts/delivery-release-tests/tsconfig.json` (add `../../src/lib/deliverySerials.ts` to `include`)

**Interfaces:**
- Produces (all exported from `src/lib/deliverySerials.ts`; the module must import nothing from `@/` aliases so the test tsconfig compiles it):
  - `parseSerialInput(text: string): string[]`: splits on `,` or newlines.
  - `formatSerialCell(serials: readonly string[]): string` and `parseSerialCell(cell: unknown): string[]`
  - `parseDeliveryDate(raw: string): Date | null`: `YYYY-MM-DD` or `M/D/YYYY`, local midnight.
  - `warrantyEnd(deliveryDate: Date): Date`
  - `type WarrantyStatus = { state: "active" | "expired"; endDate: Date; label: string }`
  - `warrantyStatus(input: { date: string; status: string; serialCount: number }, today: Date): WarrantyStatus | null`
  - `serialShortfall(input: { requiresSerial: boolean; quantity: number; serialCount: number }): { missing: number; label: string } | null`
  - `matchesDeliverySearch(query: string, fields: readonly unknown[]): boolean`
  - `deliveryPrintRows(items: readonly { quantity: number; unit: string; description: string; serialNumbers?: string[] }[]): (string | number)[][]`

- [ ] **Step 1: Write the failing tests** in `serials-test.ts` (`node:assert/strict`, same style as `reference-test.ts`):
  - `parseSerialInput cleans input`: `parseSerialInput(" A1, a1,\n\nB2 ,")` → `["A1", "B2"]`. `parseSerialInput("")` → `[]`.
  - Cell round-trip: `formatSerialCell(["A1","B2"])` → `"A1, B2"`. `parseSerialCell("A1, B2")` → `["A1","B2"]`. `parseSerialCell(undefined)` → `[]`.
  - `parseDeliveryDate handles sheet formats`: `"2025-11-19"`, `"11/19/2025"` and `"1/5/2026"` give the expected local Y/M/D. `"19 Nov"` and `""` give `null`.
  - `warrantyEnd`: `2024-02-29` → `2025-02-28`.
  - `warrantyStatus`, with delivery `2025-11-19` and status `created`, serialCount 1:
    - today `2026-11-19` → `{ state: "active", label: "Under warranty until Nov 19, 2026" }`
    - today `2026-11-20` → `state: "expired"`, label `"Warranty expired Nov 19, 2026"`
    - serialCount 0 → `null`
    - status `draft`, `cancelled` or `deleted` → `null`
    - unparseable date → `null`
  - `serialShortfall`: `{true,2,1}` → `{ missing: 1, label: "Serial missing (1 of 2)" }`. `{true,2,2}` → `null`. `{false,2,0}` → `null`.
  - `matchesDeliverySearch word by word`: the fields `["ZODIAC HEALTH VENTURES INC. (HCCH)", "Reprocessing Machine", "SN-001"]` match `"hcch reprocessing"` and `"sn-001"`, but not `"hcch parts"`. An empty query → `true`.
  - `deliveryPrintRows`: `[{quantity:1,unit:"UNIT",description:"Reprocessing Machine",serialNumbers:["A1","B2"]},{quantity:3,unit:"PC",description:"Filter"}]` → `[[1,"UNIT","Reprocessing Machine"],["","","S/N: A1, B2"],[3,"PC","Filter"]]`.

- [ ] **Step 2: Run the tests and verify they fail**

Run: `npm run test:delivery-releases`
Expected: the TypeScript compile fails because `deliverySerials.ts` is missing.

- [ ] **Step 3: Implement `src/lib/deliverySerials.ts`.** Use `addYears` and `format(d, "MMM d, yyyy")` from `date-fns`. Inside `warrantyStatus`, compare dates with `startOfDay`. For `matchesDeliverySearch`, lower-case and split the query on whitespace; every token must be a substring of at least one field.

- [ ] **Step 4: Run the tests and verify they pass**

Run: `npm run test:delivery-releases`
Expected: `All delivery-release focused tests passed.`, and the existing `.cjs` tests still pass.

- [ ] **Step 5: Commit** with the message `feat: delivery serial and warranty helpers`

---

### Task 2: Store serials and the RequiresSerial flag

**Files:**
- Modify: `src/types/deliveryReceipt.ts` (`DeliveryItem.serialNumbers?: string[]`)
- Modify: `src/lib/transactionItemSheets.ts` (`getDeliveryItems`, `replaceDeliveryItems`)
- Modify: `src/types/product-reference.ts` (`ProductCategoryRecord.requiresSerial: boolean`)
- Modify: `src/types/product-category.ts` (`ProductCategory.requiresSerial?: boolean`; create/update payloads accept it)
- Modify: `src/lib/productReferenceSheets.ts` (category read/append/update use `A:E`)
- Modify: `src/lib/services/product-category.service.ts` (`toView` maps `requiresSerial`; create/update send it)
- Modify: `src/lib/deliverySheets.ts` (both print paths, ~line 489 and ~1024, use `deliveryPrintRows`)
- Modify: `src/app/api/deliveries/route.ts` and `src/app/api/deliveries/[id]/route.ts`: confirm that `items[].serialNumbers` survives into `CreateDeliveryPayload` / `UpdateDeliveryPayload`. Where the routes rebuild items (the Sales Order path at `route.ts:95`), copy `serialNumbers` through.
- Test: `scripts/delivery-release-tests/serials-test.ts`

**Interfaces:**
- Consumes: `formatSerialCell`, `parseSerialCell` and `deliveryPrintRows` from Task 1.
- Produces:
  - `parseDeliveryItemRow(row: unknown[]): { drNumber: number; status: string; item: DeliveryItem }` and `deliveryItemRowValues(drNumber: number, index: number, item: DeliveryItem): (string | number)[]`. Both are exported from `deliverySerials.ts`, which keeps them testable. `transactionItemSheets.ts` uses them in place of its inline mapping.
  - Sheet column order stays as A–J today, plus K `SerialNumbers`.
  - `ProductCategoryRecord.requiresSerial`. Read: `String(row[4]).toUpperCase() === "TRUE"`. Write: `"TRUE"` or `"FALSE"`.

- [ ] **Step 1: Write the failing tests**:
  - `parseDeliveryItemRow legacy row`: the 10-column row `["3700","1","prod_1","RM-01","Reprocessing Machine","1","UNIT","active","dri-1",""]` gives `item.serialNumbers` `[]` and `item.deliveryReceiptItemId` `"dri-1"`.
  - The same row with `"A1, B2"` at index 10 gives `["A1","B2"]`.
  - `deliveryItemRowValues(3700, 0, {...item, serialNumbers:["A1"]})` has length 11, `[1] === 1` and `[10] === "A1"`. An item with no id gets a generated UUID at `[8]`, so assert it's a non-empty string.

- [ ] **Step 2: Run the tests and verify they fail.** Run `npm run test:delivery-releases`. Expected: the compile fails on the missing exports.

- [ ] **Step 3: Implement the row helpers.** Use `globalThis.crypto.randomUUID()` so the module stays free of `node:` imports. Then wire them in:
  - In `transactionItemSheets.ts`, change the ranges to `A2:K` and set `columnCount: 11`.
  - Add category column E to `productReferenceSheets.ts`, the types and `product-category.service.ts`.
  - Replace both inline `templateRows` builders in `deliverySheets.ts` with `deliveryPrintRows`. The reprint path keeps its existing description fallback: map `description` before calling the helper.
  - Check the two API routes as described in the Files list.

- [ ] **Step 4: Verify.** Run `npm run test:delivery-releases` and `npx tsc --noEmit`. Expected: both pass.

- [ ] **Step 5: Commit** with the message `feat: persist DR line serials and category RequiresSerial`

---

### Task 3: Serial-only update endpoint for Completed DRs

**Files:**
- Create: `src/app/api/deliveries/[id]/serials/route.ts` (`PATCH`)
- Modify: `src/lib/deliverySerials.ts` (`validateSerialUpdate`)
- Modify: `src/lib/transactionItemSheets.ts` (`updateDeliveryItemSerials`)
- Modify: `src/lib/services/delivery.service.ts` (`updateSerials`)
- Test: `scripts/delivery-release-tests/serials-test.ts`

**Interfaces:**
- Consumes: `parseDeliveryItemRow` and `formatSerialCell` from Tasks 1–2, plus `requireAuthenticatedSession` (same auth as DR `PUT`).
- Produces:
  - `type SerialUpdate = { deliveryReceiptItemId: string; serialNumbers: string[] }`
  - `validateSerialUpdate(input: { status: string; body: unknown; existingItemIds: readonly string[] }): { ok: true; updates: SerialUpdate[] } | { ok: false; status: 400 | 409 | 422; error: string }`
  - `updateDeliveryItemSerials(drNumber: number, updates: SerialUpdate[]): Promise<void>`: one `batchUpdate` that writes only `DeliveryReceiptItems!K{row}` for matching active rows.
  - `deliveryService.updateSerials(drNumber: number, updates: SerialUpdate[]): Promise<void>`
  - Request: `PATCH /api/deliveries/{drNumber}/serials` with body `{ items: SerialUpdate[] }`. Response: `200 { success: true }`.

- [ ] **Step 1: Write the failing tests** for `validateSerialUpdate`:
  - Status `completed`, with a valid body for the known id `dri-1` → `ok: true`, with serials cleaned by `parseSerialInput` rules (trim, dedupe).
  - Status `created` → `ok: true`.
  - Status `cancelled` or `deleted` → `{ ok: false, status: 409 }`.
  - `validateSerialUpdate rejects unknown id`: id `dri-x` not in `existingItemIds` → `{ ok: false, status: 422 }`.
  - A body with extra fields (e.g. `quantity`) on an item → `{ ok: false, status: 400 }`. A body that isn't `{ items: [] }`-shaped → 400.

- [ ] **Step 2: Run the tests and verify they fail.** Run `npm run test:delivery-releases`.

- [ ] **Step 3: Implement the validator, the sheet writer, the route and the service method.**
  - The route reads the DR status from `DeliveryReceipts` column K (index 10) the way `[id]/route.ts` GET does, and reads the existing item ids from `getDeliveryItems()`.
  - Unknown DR → 404.
  - The route never touches Sales Order fulfillment or the DR header.

- [ ] **Step 4: Verify.** Run `npm run test:delivery-releases` and `npx tsc --noEmit`. Expected: both pass.

- [ ] **Step 5: Commit** with the message `feat: serial-only update endpoint for delivery receipts`

---

### Task 4: Requires serial switch on Product Categories

**Files:**
- Modify: `src/app/dashboard/product-categories/page.tsx`

**Interfaces:**
- Consumes: `ProductCategory.requiresSerial` and the service create/update that accept it (Task 2).

- [ ] **Step 1: Add the switch to the page.**
  - Add `requiresSerial: boolean` to the form state, defaulting to `false`. `openEdit` loads it from the row, and `buildCreatePayload` and the update payload send it.
  - Add a checkbox labelled `Requires serial number` to the add/edit dialog, using the existing UI checkbox component in `src/components/ui`.
  - Add a table column `Serial`, showing a `Required` badge or `—`. Add it to `mobileLayout.labels`.

- [ ] **Step 2: Verify.** Run `npx tsc --noEmit` and `npm run lint`. Both should pass. Then use the `run` skill: open Product Categories, toggle RE, reload, and confirm the change persisted (`ProductCategories!E` for RE reads `TRUE`).

- [ ] **Step 3: Commit** with the message `feat: requires-serial switch on product categories`

---

### Task 5: Serial inputs on the DR create and edit forms

**Files:**
- Modify: `src/app/dashboard/delivery-releases/page.tsx` (`LineItem` type ~79, create form line rows ~1469–1560, edit form line rows ~1750–1800, payload builders ~1220 and ~1282, Sales Order prefill ~480, any `fromRelease` prefill ~241)

**Interfaces:**
- Consumes: `parseSerialInput`, `formatSerialCell` and `serialShortfall` (Task 1). `DeliveryItem.serialNumbers` (Task 2). `products[].category.id` and `productCategories[].requiresSerial` for the lookup.
- Produces: `lineRequiresSerial(item: LineItem): boolean`, a page-local function. It finds the product by `productId` or `productCode`, then the category by `product.category.id`. It returns `false` for manual lines.

- [ ] **Step 1: Add the serial input to both forms.**
  - Add `serialText: string` to `LineItem` (the raw input). Payloads send `serialNumbers: parseSerialInput(serialText)`. Edit initialization sets `serialText` to `formatSerialCell(item.serialNumbers ?? [])`.
  - Add a `Serial no(s).` textarea or input under each line's description. Placeholder: `Comma or one per line`.
  - Below the input, show the amber hint `serialShortfall(...)?.label` when `lineRequiresSerial`. Show a muted `More serials than quantity` when the count is greater than the quantity.
  - Every `LineItem` constructor (empty line, Sales Order prefill, release prefill, edit init) sets `serialText`.

- [ ] **Step 2: Verify the code.** Run `npx tsc --noEmit` and `npm run lint`. Both should pass.

- [ ] **Step 3: Check in the app** (using the `run` skill):
  - Create a DR with an RE product, quantity 2 and one serial. The hint shows `Serial missing (1 of 2)`, and the save still succeeds.
  - The printed PDF shows the `S/N:` row.
  - Edit the DR, change only the comments, and save. The serial is still there (Review Focus 2).
  - A DR created from a Sales Order accepts serials.

- [ ] **Step 4: Commit** with the message `feat: serial number inputs on delivery receipt forms`

---

### Task 6: Register search, item tags and Edit serials

**Files:**
- Modify: `src/app/dashboard/delivery-releases/page.tsx` (`filteredReceipts` ~516, `itemCount` column ~606, actions column ~770, view modal item list)
- Create: `src/components/delivery-item-summary.tsx` (item names with serials and tags, shared by the register cell and the view modal)
- Create: `src/components/edit-dr-serials-dialog.tsx`

**Interfaces:**
- Consumes: `matchesDeliverySearch`, `warrantyStatus`, `serialShortfall` and `parseSerialInput` (Task 1). `deliveryService.updateSerials` (Task 3). `lineRequiresSerial` logic from Task 5. Pass it into the components as a `requiresSerial: (item: DeliveryItem) => boolean` prop.
- Produces:
  - `<DeliveryItemSummary items={DeliveryItem[]} date={string} status={string} requiresSerial={fn} limit?={number} />`. With `limit`, it shows the first N items, then `+N more`.
  - `<EditDrSerialsDialog receipt={DeliveryReceiptSummary | null} onClose={() => void} onSaved={() => void} />`

- [ ] **Step 1: Change the register search** to `matchesDeliverySearch`, passing today's fields plus each item's `description`, `productCode` and `serialNumbers`.

- [ ] **Step 2: Build `DeliveryItemSummary`.**
  - Each item shows its description and quantity, then its serials (muted, small) and its tag.
  - Tags: green `Under warranty until …`, muted `Warranty expired …`, amber `Serial missing (n of q)`.
  - Use it in the `itemCount` cell with `limit={3}` (rename the column header to `Items`), and in the view modal without a limit.
  - Check the mobile list layout shows the cell.

- [ ] **Step 3: Build `EditDrSerialsDialog`.**
  - It lists each line's description and quantity, with a serial input pre-filled through `formatSerialCell`.
  - Lines without `deliveryReceiptItemId` show read-only.
  - Save calls `updateSerials`, shows a toast, then `onSaved` reloads receipts.
  - Add an `Edit serials` icon button to the actions column for `completed` DRs only. Non-locked DRs keep the full edit.

- [ ] **Step 4: Verify the code.** Run `npx tsc --noEmit`, `npm run lint` and `npm run test:delivery-releases`. All should pass.

- [ ] **Step 5: Check in the app** (using the `run` skill):
  - Search `HCCH reprocessing` and the DR with a reprocessing machine appears. Search by a serial and the DR appears.
  - A DR dated more than a year ago with a serial shows `Warranty expired`. A recent one shows `Under warranty until`.
  - On a Completed DR, `Edit serials` saves, and the register updates. Reprinting shows the new serial.
  - Draft and cancelled DRs show no warranty tag.

- [ ] **Step 6: Commit** with the message `feat: delivery register serial search and warranty tags`

---

### Task 7: Final verification and handoff

- [ ] **Step 1: Run the full checks.** Run `npm run test:delivery-releases`, `npx tsc --noEmit`, `npm run lint` and `npm run build`. All must pass. Record any failures that already existed before this change, and say so.
- [ ] **Step 2: Turn on RE.** Confirm with Chris whether to switch on `RequiresSerial` for RE through the Product Categories page or have it done for them.
- [ ] **Step 3: Write the handoff.** Replace `C:\Users\chris\KOS\02 - Projects\Active\AIC\handoff.md` with the feature state, the new sheet columns (`DeliveryReceiptItems!K`, `ProductCategories!E`) and any open items.
- [ ] **Step 4: Commit** any remaining doc changes.
