# Per-line Warehouses on Delivery Releases — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Each DR line takes its quantity from one or more warehouses (Salt 5 = A 2 + B 3). Stock is checked and deducted per warehouse part, and the print stays "Salt — 5".

**Architecture:** `DeliveryItem.sources` is stored in a new `DeliveryReceiptItems` column L. One pure helper (`lineSources`) turns a line into its warehouse parts, falling back to the header warehouse for old rows. The stock ledger, stock check, guard and approvals all go through it. The UI adds a per-line split editor that the Delivery Release page and the Contract Releases sheet share.

**Tech Stack:** Next.js (repo version — read `node_modules/next/dist/docs/` before touching routes), React, TypeScript, Google Sheets API, node:assert focused tests compiled with `tsc`.

**Spec:** `docs/superpowers/specs/2026-11-23-dr-line-warehouses-design.md`

## Global Constraints

- Branch: `feat/dr-line-warehouses` off `main`. Commit the spec and this plan as the first commit.
- Column L header text: `WarehouseSources`. Cell format: `WH-A:2;WH-B:3` (`;` between parts, `:` between id and qty).
- Old rows with an empty L read as "the whole quantity from the header warehouse" (column T). There is no migration, and old balances must not change.
- Header column T stays required on non-draft saves, labeled **"Default warehouse"** in the UI.
- Mismatch copy (server): `` `${productName}: warehouse quantities (${sum}) must add up to ${quantity}.` ``
- Inline UI mismatch copy: `` `${assigned} of ${quantity} assigned` ``
- No change to the DR PDF/print, Sales Order fulfillment, contract release counting or serials.
- `src/lib/inventory/domain.ts` and the new `src/lib/deliverySources.ts` stay free of `@/` imports. Use relative `.ts` imports so the focused tests compile.
- Any part in safety stock → the whole DR needs approval. Any part blocked → the whole DR is blocked.

## Review Focus

1. **Quantity edited after splitting:** a split line's qty changes from 5 to 6. The parts must not silently re-balance. The UI shows "5 of 6 assigned" and save is refused. (Task 5 test: `syncSingleSource` leaves multi-part lines untouched.)
2. **Product changed on a split line:** the parts stay (they're about where stock comes from), but the stock hints re-fetch. No stale hint survives the product swap. (Covered by `useStockCheck` key including warehouse+product, Task 5.)
3. **Edit of an old DR with no sources:** opening it shows one part from the header warehouse with the full qty, and saving unchanged must NOT re-trigger approval. (Task 4: `stockKeyOf` compares *effective* sources via `lineSources`. Test `effectiveSourcesKey` equality for stored-empty vs explicit-header-part.)
4. **Same product on two lines, same warehouse:** the requested amounts add up per (warehouse, product) before the check, exactly as today per product. (Task 3 test.)
5. **Untracked product with sources:** it must not produce a stock line or a validation error about warehouses. Empty sources are fine for an untracked product. (Task 1 test.)

---

### Task 1: Pure sources helpers

**Files:**
- Create: `src/lib/deliverySources.ts`
- Create: `scripts/delivery-release-tests/sources-test.ts`
- Modify: `scripts/delivery-release-tests/run.ts` (import the new test), `scripts/delivery-release-tests/tsconfig.json` and `scripts/inventory-tests/tsconfig.json` (add `../../src/lib/deliverySources.ts` to `include`)
- Modify: `src/types/deliveryReceipt.ts`: add `export interface WarehouseSource { warehouseId: string; quantity: number }` and `sources?: WarehouseSource[]` on `DeliveryItem`. Also update the `warehouseId` doc comments on the payload and summary to "Default warehouse; lines without sources take their full qty from it". Since `deliverySources.ts` can't import `@/`, define `WarehouseSource` in `deliverySources.ts` and re-export it from the types file with `export type { WarehouseSource } from "@/lib/deliverySources"`.

**Interfaces — Produces:**
- `parseSourcesCell(cell: unknown): WarehouseSource[]`: splits on `;`, then on the last `:`. Drops parts with an empty id or a non-positive/NaN qty.
- `formatSourcesCell(sources: readonly WarehouseSource[] | undefined): string`: `""` for none/empty.
- `lineSources(item: { quantity: number; sources?: WarehouseSource[] }, headerWarehouseId: string | undefined): WarehouseSource[]`: stored parts with qty > 0; else `[{ warehouseId: header, quantity: item.quantity }]` if both the header and qty > 0 are present; else `[]`.
- `validateLineSources(lines: { productName: string; quantity: number; tracked: boolean; sources: WarehouseSource[] }[], isActiveWarehouse: (id: string) => boolean): string | null`: for tracked lines only, checks in order: no parts → `` `${productName}: choose a warehouse.` ``; inactive part → `` `${productName}: warehouse must be an active warehouse.` ``; repeated warehouse → `` `${productName}: each warehouse can appear once.` ``; sum ≠ qty → the Global Constraints copy. Untracked lines: returns null even with empty or bad parts.
- `effectiveSourcesKey(items: { productId?: string; productCode?: string; quantity: number; sources?: WarehouseSource[] }[], headerWarehouseId: string | undefined): string`: a sorted, stable string of `product@warehouse:qty` over `lineSources`. Used for "stock unchanged" comparisons.

- [ ] **Step 1: Write failing tests** in `sources-test.ts`:
  - `parseSourcesCell("WH-A:2;WH-B:3")` deep-equals `[{warehouseId:"WH-A",quantity:2},{warehouseId:"WH-B",quantity:3}]`; `parseSourcesCell("")`, `parseSourcesCell(undefined)` → `[]`; `parseSourcesCell("WH-A:0;:3;WH-B:x")` → `[]`.
  - Round trip: `parseSourcesCell(formatSourcesCell(s))` equals `s`; `formatSourcesCell([])` → `""`.
  - `lineSources({quantity:5}, "W1")` → `[{W1,5}]`; `lineSources({quantity:5, sources:[{W2,2},{W3,3}]}, "W1")` → the stored two; `lineSources({quantity:5}, "")` → `[]`; `lineSources({quantity:0}, "W1")` → `[]`.
  - `validateLineSources`: Salt qty 5, parts 2+2 → `"Salt: warehouse quantities (4) must add up to 5."`; parts W1 2 + W1 3 → the "once" message; inactive → the active message; empty parts, tracked → the "choose" message; untracked with empty parts → `null`; valid 2+3 → `null`.
  - `effectiveSourcesKey([{productId:"P1",quantity:5}], "W1") === effectiveSourcesKey([{productId:"P1",quantity:5,sources:[{warehouseId:"W1",quantity:5}]}], "W1")`, and it differs once the parts become W1 2 + W2 3.
- [ ] **Step 2:** `npm run test:delivery-releases` → FAIL (module not found).
- [ ] **Step 3:** Implement `src/lib/deliverySources.ts` and the type changes.
- [ ] **Step 4:** `npm run test:delivery-releases` → PASS.
- [ ] **Step 5:** Commit `feat(dr-warehouses): line warehouse source helpers`.

### Task 2: Persist sources in column L

**Files:**
- Modify: `src/lib/deliverySerials.ts:103-135`: `parseDeliveryItemRow` reads `row[11]` with `parseSourcesCell` (set `sources` only when non-empty); `deliveryItemRowValues` appends `formatSourcesCell(item.sources)` as the 12th value. Update the `A:K` doc comments to `A:L`.
- Modify: `src/lib/transactionItemSheets.ts`: the three `${DR_SHEET}!A2:K` reads become `A2:L`; `columnCount: 11` → `12`.
- Modify: `scripts/setup-inventory-sheets.mjs`: add `["DeliveryReceiptItems!L1", "WarehouseSources"]` to `NEW_COLUMNS`, and `DeliveryReceiptItems: 12` to `neededColumns` (include the tab in `narrowTabs`).
- Test: `scripts/delivery-release-tests/serials-test.ts`.

- [ ] **Step 1: Failing tests:** `deliveryItemRowValues(7, 0, {…, sources:[{warehouseId:"W1",quantity:2},{warehouseId:"W2",quantity:3}]})[11] === "W1:2;W2:3"`; `parseDeliveryItemRow` of that row has those `sources`; a legacy 11-cell row parses with `sources === undefined`. Adjust any existing assertion that pins the row length to 11.
- [ ] **Step 2:** `npm run test:delivery-releases` → FAIL.
- [ ] **Step 3:** Implement.
- [ ] **Step 4:** `npm run test:delivery-releases` → PASS. Run `node scripts/setup-inventory-sheets.mjs` (audit only, no `--apply`) and expect L1 to show `missing`. Tell the user to run `npm run setup:inventory -- --apply` before deploying. Do not run apply yourself.
- [ ] **Step 5:** Commit `feat(dr-warehouses): store line warehouse sources in DeliveryReceiptItems!L`.

### Task 3: Ledger and stock check per warehouse part

**Files:**
- Modify: `src/lib/inventory/domain.ts`: `LineCheck` gets `warehouseId: string`. `checkLines(balances, warehouseId, lines: { warehouseId?: string; productId?: string; quantity: number }[], tracked)`: each line's `warehouseId` wins over the parameter; group by `stockKey(warehouse, product)`; output one `LineCheck` per group, carrying its `warehouseId`. Lines whose effective warehouse is empty are skipped. Transfers keep calling it unchanged.
- Add to `domain.ts`: `drCheckLines(items: { productId?: string; quantity: number; sources?: WarehouseSource[] }[], headerWarehouseId: string): { warehouseId: string; productId: string; quantity: number }[]`, which flattens via `lineSources`. Its callers have already resolved `productId` from the code.
- Modify: `src/lib/inventory/sheets.ts:230-248` `listDrStockLines`: push one `DrStockLine` per `lineSources(item, header.warehouseId)` part, using that part's `warehouseId` and `quantity`.
- Test: `scripts/inventory-tests/domain-test.ts`.

- [ ] **Step 1: Failing tests:**
  - Existing `checkLines(balances,"W1",[{productId:"P1",quantity:6}],…)` results unchanged, and `lines[0].warehouseId === "W1"`.
  - With an OPENING of 10 at W1 (safety 4) and an OPENING of 3 at W2 (no safety): `checkLines(b, "", [{warehouseId:"W1",productId:"P1",quantity:2},{warehouseId:"W2",productId:"P1",quantity:3}], tracked)` → result `ok`, two LineChecks.
  - Same, but W2 qty 4 → overall `blocked`, and the W2 line is `blocked` with `shortfall 1`.
  - W1 qty 8 + W2 qty 1 → `needs_approval`.
  - Two lines P1 @ W1 qty 2 and qty 3 → one LineCheck, `requested 5`.
  - `drCheckLines([{productId:"P1",quantity:5,sources:[{W1,2},{W2,3}]}], "W1")` → two entries; `drCheckLines([{productId:"P1",quantity:5}], "W1")` → `[{W1,P1,5}]`.
- [ ] **Step 2:** `npm run test:inventory` → FAIL.
- [ ] **Step 3:** Implement. Fix every compile error from `LineCheck.warehouseId` (the transfer paths in `service.ts` get it for free from `checkLines`).
- [ ] **Step 4:** `npm run test:inventory` → PASS; `npx tsc --noEmit -p .` → no errors.
- [ ] **Step 5:** Commit `feat(dr-warehouses): ledger and stock check per warehouse part`.

### Task 4: Server guard, routes and approvals

**Files:**
- Modify: `src/lib/inventory/service.ts`:
  - `previewCheck(input: { warehouseId: string; lines: { warehouseId?: string; productId?: string; productCode?: string; quantity: number }[]; exclude? })` passes the line `warehouseId` through to `checkLines`.
  - `guardDrStock` input `items` gains `sources?`. Resolve productIds, then run `validateLineSources` (product name from `names.product`, tracked from `tracked`, active from `names.activeWarehouse`) and throw `InventoryValidationError` on a message. Expand with `drCheckLines`. Run the opening-date check per part, naming the part's warehouse. `blockedMessage` uses the blocked line's own `warehouseId` (change its signature to `(check, warehouseName: (id) => string, product)`).
- Modify: `src/lib/inventory/drGuard.ts`: `guardedDrWrite` input `items` type gains `sources?`. Keep `activeWarehouseError` for the header default only, and update its message to `"Default warehouse is required."` / `"Default warehouse must be an active warehouse."`.
- Modify: `src/app/api/inventory/check/route.ts`: accept lines with `warehouseId`. Return the empty check only when neither `body.warehouseId` nor any line `warehouseId` is set.
- Modify: `src/app/api/deliveries/[id]/route.ts:190-195`: replace `stockKeyOf` with `effectiveSourcesKey(items, warehouseId)` against `effectiveSourcesKey(stored.items, stored.warehouseId)`. The `warehouseId === stored.warehouseId` clause stays.
- Modify: `src/app/api/inventory/approvals/dr/[id]/route.ts`: no code change needed beyond types (`stored.items` now carries `sources`). Verify it compiles.
- Modify: `src/app/api/inventory/approvals/route.ts`: for DRs, `describe` uses `drCheckLines` on the resolved items with the header warehouse, and adds `warehouseName` per check line. The DR entry's `warehouseName` becomes the unique part warehouse names joined with `", "` (in first-seen order).

- [ ] **Step 1:** `npx tsc --noEmit -p .` and `npm run lint` → clean.
- [ ] **Step 2:** `npm run test:inventory && npm run test:delivery-releases && npm run test:contract-releases && npm run test:sales-orders` → PASS.
- [ ] **Step 3:** Commit `feat(dr-warehouses): guard, routes and approvals use line warehouse parts`.

### Task 5: Shared split editor and per-part hints

**Files:**
- Create: `src/components/inventory/line-sources.tsx`
- Modify: `src/components/inventory/dr-stock.tsx`
- Modify: `src/lib/deliverySources.ts` + `scripts/delivery-release-tests/sources-test.ts` (one pure helper)

**Interfaces — Produces:**
- `syncSingleSource(sources: WarehouseSource[] | undefined, quantity: number, defaultWarehouseId: string): WarehouseSource[]` (pure, in `deliverySources.ts`): 0 or 1 part → `[{ warehouseId: (existing part's id || default), quantity }]`, or `[]` when there's no warehouse; 2+ parts → returned unchanged. Pages call it whenever a line's qty changes. When the default warehouse changes, pages call it with the new default for lines whose single part still equals the *old* default.
- `<LineSources value onChange quantity warehouses check productId disabled? />` in `line-sources.tsx`. It renders each part as a warehouse `Select` + qty `Input` + remove button (hidden when there's one part), a "Split" / "Add warehouse" button, the inline `"${assigned} of ${quantity} assigned"` in destructive text when they differ, and a `StockLineHint` per part.
- `useStockCheck({ lines: { warehouseId?: string; productId?: string; productCode?: string; quantity: number }[], warehouseId?: string, … })`: the request key includes each line's warehouse. It's enabled when any line has a warehouse or `warehouseId` is set.
- `StockLineHint({ check, productId, warehouseId, warehouseName, productName })` matches on both `productId` and `warehouseId`.
- `approvalPrompt(check, level, warehouseName: (id: string) => string, productName)`: each line reads `` `${product} at ${warehouseName(l.warehouseId)}: uses ${l.safetyUsed} of ${l.safetyStock} safety stock` ``. The header line becomes `"Needs approval: uses safety stock."`.
- `sourcesComplete(lines: { quantity: number; sources?: WarehouseSource[] }[]): boolean` (pure, `deliverySources.ts`): every line with qty > 0 has parts summing to its qty.

- [ ] **Step 1: Failing tests** for `syncSingleSource` (`([], 5, "W1")` → `[{W1,5}]`; `([{W2,4}], 5, "W1")` → `[{W2,5}]`; two parts unchanged; `([], 5, "")` → `[]`) and `sourcesComplete`.
- [ ] **Step 2:** `npm run test:delivery-releases` → FAIL.
- [ ] **Step 3:** Implement the helpers, `line-sources.tsx` and the `dr-stock.tsx` signature changes. Relabel the `WarehouseSelect` default to `"Default warehouse"`.
- [ ] **Step 4:** `npm run test:delivery-releases` → PASS. tsc errors will now point at the two callers, which are fixed in Tasks 6–7, so don't commit a broken build: continue to Task 6 and commit 5+6 together if needed.

### Task 6: Delivery Release page (create + edit)

**Files:**
- Modify: `src/app/dashboard/delivery-releases/page.tsx`: `LineItem` (line ~80) gets `sources: WarehouseSource[]`; `EMPTY_LINE_ITEM` gets `sources: []`; `toDeliveryItems` passes `sources`. In the create and edit forms:
  - Line add: the line's sources = `syncSingleSource([], qty, defaultWarehouse)`. Line qty change: `syncSingleSource`. Default warehouse change: re-sync lines whose single part equals the previous default.
  - Loading an existing DR into edit (line ~1302 and ~542): `sources = lineSources(item, receipt.warehouseId)`.
  - Render `<LineSources>` under each line's product cell, replacing the current `StockLineHint` usage at ~1680 and ~1985.
  - `useStockCheck` lines: `drCheckLines`-shaped `{ warehouseId, productId, productCode, quantity }` flattened from each line's sources.
  - Submit (create ~1065, edit ~1362): keep the "Default warehouse is required." toast. Before the approval prompt, if `!sourcesComplete(lines)` show `toast.error("Warehouse quantities must add up to each line's quantity.")` and stop. Pass `warehouseName` (the function) to `approvalPrompt`.
  - Drafts skip the completeness toast (this matches the server).

- [ ] **Step 1:** `npx tsc --noEmit -p .` and `npm run lint` → clean.
- [ ] **Step 2:** Run the app (`run` skill). Create a DR with Salt 5 split 2/3 across two warehouses. Check that the hints show per warehouse, the save succeeds, and the print/preview shows a single "Salt 5". Reopen it in edit and confirm the split is intact. Make a 2/2 mismatch and confirm the inline text shows and save is refused. Open an old DR and save without changes, and confirm the status is unchanged.
- [ ] **Step 3:** Commit `feat(dr-warehouses): per-line warehouse split on Delivery Release page` (include the Task 5 files if they weren't committed yet).

### Task 7: Contract Releases sheet and Stock Approvals page

**Files:**
- Modify: `src/app/dashboard/contract-releases/release-sheet.tsx`: `Row` gets `sources`. The same sync rules as Task 6 apply, with `LineSources` under each row. Stock lines are flattened from sources. The submit check uses `sourcesComplete`, and `items[].sources` goes in the payload. The picker label changes to `"Default warehouse"`.
- Modify: `src/app/dashboard/stock-approvals/page.tsx`: per-line rows show `warehouseName` from the approvals API (Task 4) next to each product line. The header line keeps `from {item.warehouseName}`, which now reads "from A, B".

- [ ] **Step 1:** `npx tsc --noEmit -p .`, `npm run lint`, `npm run test:inventory`, `npm run test:delivery-releases`, `npm run test:contract-releases` → all clean.
- [ ] **Step 2:** In the app: release a contract item with a 2/3 split, confirm the DR is created and the contract backlog drops by 5. Create a DR whose W2 part dips into safety stock and confirm it shows in Stock Approvals as "from A, B", with the W2 line marked. Approve it and confirm the stock drops at both warehouses on the Inventory page.
- [ ] **Step 3:** Commit `feat(dr-warehouses): contract release sheet and approvals show line warehouses`.
- [ ] **Step 4:** Refresh `C:\Users\chris\KOS\02 - Projects\Active\AIC\handoff.md` (replace it). Note the column L setup step (`npm run setup:inventory -- --apply`) as a deploy prerequisite.
