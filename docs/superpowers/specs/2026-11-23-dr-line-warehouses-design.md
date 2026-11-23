# Per-line warehouses on Delivery Releases — design

Date: 2026-11-23
Status: approved approach (A), awaiting design approval

## Intent

A Delivery Receipt (DR) can carry items that come from more than one warehouse.
Today the warehouse sits on the DR header, so every line is checked and taken out of
one warehouse. That's wrong in practice. Example: the customer needs 5 salt. Warehouse A has
2 and Warehouse B has 3. The DR must take 2 from A and 3 from B, and still print "Salt — 5".

The warehouse on a DR only tells inventory **where the stock is taken from**. The customer
never sees it.

## Goals

- Each DR line says where its quantity comes from, as one or more parts: `{ warehouse, qty }`.
- One line can be split across warehouses (Salt 5 = A 2 + B 3).
- The stock check, the safety-stock approval and the stock deduction work per part, at that
  part's warehouse.
- Both the Delivery Release page (create and edit) and the Contract Releases release sheet
  get this.

## Non-goals

- No change to the printed DR or PDF. It shows the line (product, total qty), not warehouses.
- No change to Sales Order fulfillment, contract release counting or serial numbers. They
  keep working on the line's total quantity.
- No change to Stock Transfers or manual stock entries.

## Anti-goals (a failure even if it "works")

- Old DRs' stock numbers change after deploy.
- A line's warehouse parts don't add up to the line quantity, and the DR saves anyway.
- One product ends up as two printed lines.

## Approaches considered

- **A. One line per product with a warehouse split inside it (chosen).** The line stays
  "Salt, 5". A small split sits under it ("A 2, B 3"). Only the inventory side reads the
  split, so print, SO fulfillment, contract lines and serials are untouched. The cost is a
  slightly richer line editor.
- **B. Separate DR lines per warehouse, merged when printing.** The editor is simpler, but
  printing, SO fulfillment (one SO line spread over two DR lines), contract `deliveryLineIndex`
  and serials would all need merging logic. Rejected: more places for counts to drift.

## Design

### Data

- `DeliveryItem` gets `sources?: { warehouseId: string; quantity: number }[]`.
- Stored in a new column **L `WarehouseSources`** on `DeliveryReceiptItems`, written as
  `WH-A:2;WH-B:3`. Read and write ranges grow from `A:K` to `A:L` (`transactionItemSheets.ts`,
  `deliverySerials.ts` row parse/build). The column is added by the existing inventory setup
  script, or written with its header if it's missing.
- The header column **T `WarehouseId`** stays as the DR's **default warehouse**. A line
  with no stored sources means "all of its quantity from the header warehouse". Old DRs therefore
  read exactly as today, and **no migration is needed**.

### Effective sources (one shared helper)

`lineSources(item, headerWarehouseId)` lives in `inventory/domain.ts` (pure):
- stored sources with qty > 0 → those;
- else, if the header has a warehouse → `[{ headerWarehouseId, item.quantity }]`;
- else → `[]` (an old DR with no warehouse has no stock effect, as today).

Everything below uses this helper. No caller reads the header warehouse directly for stock.

### Validation (server, on non-draft saves)

- Every part's warehouse must be active.
- For each line, the sum of its parts must equal the line quantity. Message:
  "Salt: warehouse quantities (4) must add up to 5."
- One warehouse appears at most once per line.
- Non-tracked products: their sources are kept but ignored for stock, like today.
- Drafts: sources are saved as entered, with no checks (same as today's draft behavior).

### Stock ledger

`listDrStockLines()` emits one `DrStockLine` per **part** (warehouse, product, qty) instead
of one per line. `computeBalances` is unchanged.

### Stock check / guard

- `checkLines` takes lines that already carry a warehouse: `{ warehouseId, productId, quantity }[]`.
  It groups by (warehouse, product) and returns `LineCheck` entries that now include `warehouseId`.
  Stock Transfers call it with their single from-warehouse on every line, so their behavior is unchanged.
- `guardDrStock` takes `items` (with sources) plus the header `warehouseId`. It expands the
  items with `lineSources`, runs the opening-date check per part, and names the right warehouse in the
  blocked message ("Not enough stock at Warehouse B: Salt needs 3, 1 on hand").
- Approval rule is unchanged: if any part dips into safety stock, the whole DR goes to
  `pending_approval` (or self-approves for a manager). Any blocked part blocks the save.
- `/api/inventory/check` accepts lines with a warehouse each, and keeps the old
  `warehouseId` + lines shape working for Stock Transfers.
- The approval route (`approvals/dr/[id]`) re-checks with the stored items' sources.
- The `activeWarehouseError` header check becomes a check of every part's warehouse. The header
  default is still required on non-draft saves, because it is what new lines and old lines fall back to.

### UI — Delivery Release page (create + edit) and Contract Releases sheet

- The header picker is relabeled **"Default warehouse"**. New lines take it with their full quantity.
- Each line shows its warehouse under the product, with a small **"Split"** control. A split line
  lists its parts as rows (warehouse dropdown + qty + remove), plus "Add warehouse".
- While a line is not split, changing the line qty or the default warehouse moves the single part
  with it. Once a line is split, the parts are the user's; a mismatch shows inline
  ("3 of 5 assigned") and blocks save.
- Stock hints (`StockLineHint`) show per part, for that part's warehouse.
- The `approvalPrompt` text lists each part with its warehouse name.
- The Stock Approvals page shows "from A, B" when a DR uses more than one warehouse.
- The UI sends `sources` on every line, including unsplit ones, so new DRs are explicit.
  The fallback exists only for old rows.

### Print / PDF / SO / contracts

No change. They read `items[].quantity` as today.

## Tests (extend `test:inventory` and `test:delivery-releases`)

- `lineSources`: stored parts, header fallback, no warehouse.
- Ledger: a split line deducts 2 from A and 3 from B. An old line with no sources deducts from the header warehouse.
- `checkLines` with two warehouses: one part blocked → DR blocked; one part in safety → needs approval.
- Validation: parts that don't add up, an inactive warehouse, a repeated warehouse.
- Row parse/build round-trips column L, and an empty L parses as no sources.

## Builder calls (left to implementation)

- Exact layout of the split editor inside the existing line table.
- Whether to add the column L header through the setup script or on first write. The existing pattern decides.
