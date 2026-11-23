# Stock on Hand: one row per product, warehouses as columns

Date: 2026-11-23 · Size: small change (one page file)

## Why

Today the Stock on Hand table (`src/app/dashboard/inventory/page.tsx`) has one row per product per warehouse (436 rows for ~109 products × 4 warehouses). The same product repeats four times, which is confusing. One row per product, with each warehouse as a column, makes a product's stock readable at a glance.

## Goals

- One row per tracked product; one column per active warehouse (columns come from `warehouses` in the `/api/inventory` response, so a new warehouse adds a column automatically).
- Each warehouse cell shows **On hand** (main number) and **Available** (small muted line, e.g. `avl 10`).
- A **Total** column: sum of On hand and sum of Available across counted warehouses (uncounted count as 0).
- Clicking a warehouse cell opens a side panel for that product at that warehouse.

## Non-goals

- No API, database, or domain changes. No change to Export movements, Add stock entry, or the existing dialogs' behavior.
- Safety stock is not shown in the grid (it lives in the side panel).

## Anti-goals

- Losing any current capability: opening count, recount, set safety stock, movement history, void entry, negative-stock warnings, permission checks (`canPerform`).

## Approaches

1. **Pivot in the browser (chosen).** The page already receives every warehouse×product row; group by `productId` in a `useMemo`. Small data, zero backend change.
2. Pivot on the server. Rejected: touches the API and the export path for no gain at this data size.

## Design

**Grid row** (`ProductRow`): `productId`, `productCode`, `productName`, `categoryName`, `cells: Record<warehouseId, StockRow | undefined>`, `totalOnHand`, `totalAvailable`.

**Columns:** Product (name + code, as today) · Category · one column per warehouse (header = warehouse name) · Total.

**Warehouse cell:**
- Counted: `onHand` with `avl {available}` underneath.
- Not counted (`openingDate` null): `—` with a small "count" tag (replaces the wide "Needs opening count" badge).
- No row for that pair: `—`, not clickable.
- Warning colors move from the row to the cell: red when `onHand < 0`, amber when `available < 0`.
- Cell is a button; click opens the side panel (stop propagation so no row-click action fires). The row itself has no click action.

**Side panel** (extends the existing history `Sheet`): title = product name, description = warehouse name. Shows On hand, Safety, Available; buttons **Opening count / Recount** (gated by `entry:OPENING` / `entry:ADJUSTMENT`) and **Set safety** (gated by `safety:set`) that open the existing dialogs; then the existing movement history list with void. After a save, the panel's numbers refresh from the reloaded data.

**Filters:**
- Warehouse filter becomes "show only this warehouse's column" (Total still shown). Export movements keeps using it as today.
- Category filter and search filter products as today.

**Phone width:** card per product: name, code and totals on top, then one line per warehouse (`MAMATID · 12 · avl 10`, or `· count`). Tapping a line opens the same side panel.

## Left to the builder

- Exact styling of the "count" tag and muted Available line.
- Whether warehouse/Total columns are sortable (sort by On hand if `EntityTable` supports it cheaply).
- How to render the phone card (via `EntityTable`'s `mobileLayout` or a custom cell), whichever fits the existing component.
