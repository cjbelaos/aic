# Stock on Hand Pivot Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Show Stock on Hand as one row per product with one column per warehouse (On hand + Available per cell, plus a Total), with a per-cell side panel for counts, safety stock and history.

**Architecture:** A pure `pivotStock` function regroups the existing `/api/inventory` rows by product in the browser. The page builds warehouse columns dynamically from the active warehouses and replaces row clicks with cell clicks that open the existing history `Sheet`, extended with the numbers and action buttons. No API or DB changes.

**Tech Stack:** Next.js (read `node_modules/next/dist/docs/` before touching Next APIs — none expected here), React, TanStack Table via `EntityTable`, shadcn/ui, TypeScript; tests via `npm run test:inventory` (node:assert, compiled with tsc).

**Spec:** `docs/superpowers/specs/2026-11-23-stock-on-hand-pivot-design.md`

## Global Constraints

- No changes to `/api/inventory*` routes, `src/lib/inventory/domain.ts`, Export movements, Add stock entry, or the existing dialogs' behavior.
- Warehouse columns come from `warehouses` in the `/api/inventory` response, in that order.
- Total = sum over **counted** cells only (`openingDate` non-null); uncounted count as 0.
- Uncounted cell: `—` plus a small "count" tag. No row for the pair: `—`, not clickable.
- Cell colors: red when `onHand < 0`, amber when `available < 0` (same classes as today). No row-level highlight, no row click.
- Permission gates unchanged: `entry:OPENING` / `entry:ADJUSTMENT` for count/recount, `safety:set` for safety stock, `entry:void` for void.

## Review Focus

1. **Product has no row at one warehouse** (e.g. a warehouse added after tracking started) → that cell is `—`, not clickable, excluded from Total. Pinned in Task 1 (`missing pair`).
2. **Uncounted warehouse with safety stock > 0** (its `available` is negative) → excluded from Total Available; cell shows the "count" tag, not amber. Pinned in Task 1 (`uncounted excluded`).
3. **Negative counted stock** → Totals include negatives (not clamped). Pinned in Task 1 (`negative totals`).
4. **Side panel open while saving a recount or safety stock** → panel numbers and history update without closing. Verified manually in Task 2, Step 4.
5. **Rows for a warehouse not in the active list** → ignored (no cell, not in Total), consistent with the columns shown. Pinned in Task 1 (`unknown warehouse`).

---

### Task 1: `pivotStock` pure function

**Files:**
- Create: `src/lib/inventory/pivot.ts`
- Create: `scripts/inventory-tests/pivot-test.ts`
- Modify: `scripts/inventory-tests/run.ts` (add `import "./pivot-test.ts";`)
- Modify: `scripts/inventory-tests/tsconfig.json` (add `"../../src/lib/inventory/pivot.ts"` to `include`)

**Interfaces:**
- Produces (from `src/lib/inventory/pivot.ts`):
  - `export interface StockRow` — moved verbatim from `page.tsx` (`warehouseId, warehouseName, productId, productCode, productName, categoryName, openingDate: string | null, onHand, safetyStock, available`).
  - `export interface ProductRow { productId: string; productCode: string; productName: string; categoryName: string; cells: Record<string, StockRow | undefined>; totalOnHand: number; totalAvailable: number }`
  - `export function pivotStock(rows: StockRow[], warehouseIds: string[]): ProductRow[]` — one entry per product in first-appearance order; `cells` keyed by warehouseId; rows whose warehouseId is not in `warehouseIds` are ignored; totals sum counted cells only.

- [ ] **Step 1: Write the failing tests** in `scripts/inventory-tests/pivot-test.ts` (style: `import assert from "node:assert/strict"`, plain top-level blocks, as in `domain-test.ts`). Helper `row(wh, product, onHand, available, counted = true)` builds a `StockRow`.

```ts
// groups by product, first-appearance order
const out = pivotStock([row("W1","P1",5,5), row("W2","P1",3,1), row("W1","P2",2,2)], ["W1","W2"]);
assert.deepEqual(out.map(p => p.productId), ["P1","P2"]);
assert.equal(out[0].cells.W2?.onHand, 3);
assert.equal(out[0].totalOnHand, 8);
assert.equal(out[0].totalAvailable, 6);

// missing pair
assert.equal(out[1].cells.W2, undefined);
assert.equal(out[1].totalOnHand, 2);

// uncounted excluded (onHand 0, available -4 from safety stock)
const u = pivotStock([row("W1","P1",5,5), row("W2","P1",0,-4,false)], ["W1","W2"]);
assert.equal(u[0].totalAvailable, 5);
assert.ok(u[0].cells.W2); // cell still present so it can be counted

// negative totals
const n = pivotStock([row("W1","P1",-2,-3), row("W2","P1",1,1)], ["W1","W2"]);
assert.equal(n[0].totalOnHand, -1);
assert.equal(n[0].totalAvailable, -2);

// unknown warehouse
const x = pivotStock([row("W1","P1",5,5), row("OLD","P1",9,9)], ["W1"]);
assert.equal(x[0].cells.OLD, undefined);
assert.equal(x[0].totalOnHand, 5);
```

- [ ] **Step 2: Run to verify it fails**
Run: `npm run test:inventory`
Expected: tsc error — cannot find module `pivot.ts` / `pivotStock`.

- [ ] **Step 3: Implement `pivotStock` in `src/lib/inventory/pivot.ts`** — single pass with a `Map<productId, ProductRow>`; no imports.

- [ ] **Step 4: Run to verify it passes**
Run: `npm run test:inventory`
Expected: ends with `All inventory focused tests passed.`

- [ ] **Step 5: Commit**
```bash
git add src/lib/inventory/pivot.ts scripts/inventory-tests
git commit -m "feat(inventory): pivotStock groups stock rows by product"
```

---

### Task 2: Pivoted Stock on Hand page

**Files:**
- Modify: `src/app/dashboard/inventory/page.tsx`

**Interfaces:**
- Consumes: `StockRow`, `ProductRow`, `pivotStock` from `@/lib/inventory/pivot` (delete the local `StockRow` interface).

- [ ] **Step 1: Data and filters.**
  - `products = useMemo(() => pivotStock(rows, warehouses.map(w => w.warehouseId)), [rows, warehouses])`.
  - `shownWarehouses` = all warehouses, or just the one matching `warehouseFilter`.
  - `visible` = `products` filtered by `categoryFilter` only (warehouse filter now hides columns, not rows). `categories` unchanged.

- [ ] **Step 2: Columns** (`ColumnDef<ProductRow>[]`):
  - `productName` (Product, same cell as today), `categoryName` (Category).
  - For each `shownWarehouses` entry: `id: "wh:" + warehouseId`, header = warehouse name, `accessorFn` = counted cell's `onHand`, else `null` (sortable). Cell component `WarehouseCell({ cell, onOpen })`:
    - no cell → `<span className="text-muted-foreground">—</span>`
    - uncounted → button with `—` + small outline "count" tag
    - counted → button with `onHand` (tabular-nums; `font-semibold text-destructive` if `< 0`) and below it `avl {available}` in `text-xs text-muted-foreground` (`text-amber-600 dark:text-amber-400` if `available < 0`)
    - button: `variant="ghost" size="sm"`, auto height, `title="Open {warehouseName}"`, `onClick` → `event.stopPropagation(); onOpen(cell)`.
  - `id: "total"`, header "Total", `accessorFn: r => r.totalOnHand`, cell shows `totalOnHand` over `avl {totalAvailable}` with the same negative colors.
  - Remove the old `warehouseName`, `onHand`, `safetyStock`, `available` columns.

- [ ] **Step 3: Side panel and table wiring.**
  - Replace `historyTarget: StockRow | null` with `panelKey: { warehouseId: string; productId: string } | null`; derive `panelRow` from `rows` with `useMemo` so it reflects the latest `load()`. `openHistory(row)` sets `panelKey` and loads history as today.
  - Sheet header: title = product name, description = `warehouseName` (+ `counted from {openingDate}` when set). Below it, a 3-up grid: On hand, Safety, Available (same negative colors). Buttons: "Opening count" / "Recount" → `openCount(panelRow)` gated as today; "Set safety" → existing safety dialog, gated by `safety:set`. Then the existing history list unchanged.
  - After `saveCount`, `saveSafety`, and `voidEntry` succeed, if a panel is open re-fetch its history (`saveCount` and `voidEntry` change history; `saveSafety` only needs `load()`).
  - `EntityTable`: `data={visible}`, `getRowId={r => r.productId}`, remove `onRowClick` and `getRowClassName`, `mobileLayout={{ primary: ["productName", "total", ...shownWarehouses.map(w => "wh:" + w.warehouseId)], labels: { productName: "Product", categoryName: "Category", total: "Total", ...Object.fromEntries(shownWarehouses.map(w => ["wh:" + w.warehouseId, w.name])) } }}`.

- [ ] **Step 4: Verify.**
  Run: `npx tsc --noEmit -p .` and `npx eslint src/app/dashboard/inventory/page.tsx src/lib/inventory/pivot.ts` — expected: no errors.
  Run: `npm run test:inventory` — expected: passes.
  Run the app (`run` skill) and check at `/dashboard/inventory`:
  - ~109 rows; 4 warehouse columns + Total; uncounted cells show `—` + "count".
  - Click an uncounted cell → panel → Opening count → save: panel stays open, shows the new On hand, history lists the entry, grid cell updates.
  - Recount and Set safety from the panel: numbers in panel and grid update; void from history recalculates.
  - Warehouse filter shows a single warehouse column + Total; category filter and search narrow products.
  - Phone width (≤ 767px): one card per product listing Total and each warehouse; tapping a warehouse value opens the panel.

- [ ] **Step 5: Commit**
```bash
git add src/app/dashboard/inventory/page.tsx
git commit -m "feat(inventory): stock on hand as one row per product, warehouses as columns"
```
