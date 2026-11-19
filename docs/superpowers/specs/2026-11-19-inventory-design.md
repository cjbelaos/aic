# Inventory (Stock On Hand per Warehouse) — Design

Date: 2026-11-19
Status: Awaiting Chris's approval

## Intent

The business needs to know how much of each product is on hand in each warehouse, and to stop
deliveries that would ship stock it doesn't have. A physical count has already been done. For
now, stock coming **in** is entered by hand; stock going **out** is taken from Delivery Receipts
(DRs) automatically. Later, "in" will be automated too (most likely receiving against Purchase
Orders), so this is the first piece of a real inventory module, not a throwaway page.

The manager asked for three rules: DRs must carry a warehouse; a DR that exceeds stock is
blocked; and each product's **safety stock** (a reserved quantity) can only be delivered out with
approval from a manager or above.

## Goals

- Show on-hand, safety stock, and available quantity per product per warehouse, with a full
  movement history (every in and out, who, when, why).
- Record stock in by hand: opening counts, receipts from suppliers, customer returns, adjustments.
- Take stock out automatically from DRs, which now record the warehouse they ship from.
- Move stock between warehouses with a Stock Transfer document.
- Block DRs and transfers that exceed on-hand; require manager approval when they dip into
  safety stock.
- Let categories opt in to tracking, so rollout can go category by category.

## Non-goals

- Automated receiving against Purchase Orders (future; it will write into the same stock log).
- Serial-level stock (which serial sits in which warehouse). DRs still record serials going out.
- Stock valuation / costing (quantities only).
- Email notifications for approvals (in-app list only).
- In-transit transfers (transfers are one step).
- Backfilling warehouses onto historical DRs.

## Anti-goals

- Stock silently drifting from the DRs (an edited/cancelled/deleted DR must change stock immediately).
- Two simultaneous saves both passing the stock check and overdrawing a warehouse.
- Blocking DRs for products nobody counted (untracked categories are never checked).
- Breaking the A4 DR print layout or the existing DR → Sales Order fulfillment flow.

## Approaches

- **A. Derive from source documents (chosen).** Stock Entries and Stock Transfers live in a new
  stock log sheet. DR outs are not copied; every stock calculation reads `DeliveryReceiptItems`
  + `DeliveryReceipts` directly (dated on/after go-live, counting statuses only). Nothing can
  drift, and existing DR edit/cancel/delete/serial-update paths need no sync code. Cost: each
  check reads the DR sheets (one or two Sheets calls); acceptable at current volume.
- **B. Single stock ledger.** DR saves also write "out" rows; edits/cancels write reversals.
  Fastest reads, but every DR write path (create, edit, status change, delete, approval,
  serial-only update) must stay in sync or stock goes wrong silently. Rejected.
- **C. Running balance table.** No history, lost updates under concurrency. Rejected.

Chris picked A.

## Decisions (agreed with Chris and the manager)

1. **Warehouse on DRs.** Every new DR has a required "From warehouse" (active warehouses only).
   Historical DRs are left alone.
2. **Track inventory switch** on product categories (like "Requires serial"). Only products in
   tracked categories appear on the inventory page and are stock-checked. Off by default.
3. **Go-live = launch day.** Opening counts are entered **as of launch day** (users subtract
   anything delivered since the physical count before entering). Only DRs dated on/after a
   warehouse+product's opening-count date reduce its stock.
4. **Which DRs count:** statuses `created`, `printed`, `completed`. Not counted: `draft`,
   `pending_approval`, `rejected`, `cancelled`, `deleted`, `void`.
5. **Block** any DR or transfer line that would take on-hand below zero. No override.
6. **Safety stock** is set per product per warehouse; blank = 0.
   `available = on hand − safety stock`.
   - qty ≤ available → saves normally.
   - available < qty ≤ on hand → needs approval (status `pending_approval`).
   - qty > on hand → blocked.
7. **Approval flow (DRs and transfers).** A save that dips into safety stock is stored as
   `pending_approval`: it cannot be printed and does not reduce stock. Approvers see it on an
   in-app **Approvals** list and approve or reject with a note. On approval stock is re-checked;
   if it still fits within on hand it becomes `created` (printable, counted); otherwise approval
   fails with the shortfall shown and the record stays pending. Rejected records keep status
   `rejected` and do not count.
   **Who approves:** any Manage-level user can approve or reject any pending DR or transfer (no
   department restriction). **A Manage-level user's own save skips approval**: it goes straight
   to `created` (still blocked if over on hand), and is stamped ApprovedBy = themselves,
   ApprovalNote = "Self-approved (Manager)", so safety-stock use stays auditable.
8. **Stock Transfers** are a separate document (not a DR): transfer no., date, from warehouse,
   to warehouse, lines (product, qty, optional serials), prepared by, note. One step: saving
   moves stock out of A and into B immediately. Same block/safety-stock/approval rules as DRs,
   applied to the *from* warehouse. Optional printable transfer slip.
9. **Stock Entry types:** `OPENING` (opening count), `RECEIVED` (+), `RETURN` (customer return, +),
   `ADJUSTMENT` (+ or −, note required). Fields: date, warehouse, product, quantity, type,
   reference no., note.
10. **Access** (by position title):
    | Level | Who | Can do |
    |---|---|---|
    | View | everyone else | view inventory page and history |
    | Operate | Staff, Tech Admin | + opening counts, received, returns, adjustments (recounts), transfers |
    | Manage | Manager and above | + void entries, safety stock, approve/reject |
    "Manager and above" = position title contains "manager" (case-insensitive) **or** is in the
    executive list in `src/lib/positionUtils.ts` (GM, CEO, CFO, COO…). Super Admins are Manage.
    *Updated 2026-11-19 at Chris's request: Staff and Tech Admin may also record adjustments, so they can recount a wrong number from the On hand column. Every adjustment keeps who/when/why in the history.*
    "Staff" and "Tech Admin" match those position titles exactly (case-insensitive). DR creation
    permissions are unchanged; the stock check applies to whoever creates the DR.

## Design

### Data (Google Sheets, database spreadsheet)

- `ProductCategories` — new column **F: TrackInventory** (`TRUE`/`FALSE`), mirroring
  `RequiresSerial` in `src/lib/productReferenceSheets.ts`.
- `DeliveryReceipts` — new column **T: WarehouseId**.
- **`StockMovements`** (new) — the stock log for manual entries and transfers:
  `MovementId | Date | WarehouseId | ProductId | Qty (signed) | Type | SourceType | SourceId | ReferenceNo | Note | Status | CreatedBy | CreatedAt | UpdatedBy | UpdatedAt`.
  Type ∈ `OPENING, RECEIVED, RETURN, ADJUSTMENT, TRANSFER_OUT, TRANSFER_IN`. Entries are never
  edited in place for quantity; corrections are new `ADJUSTMENT` rows (or voiding a mistaken
  entry, which sets Status `void`, Manage level only).
- **`StockTransfers`** (new) — header: `TransferId | TransferNo | Date | FromWarehouseId | ToWarehouseId | Status | PreparedBy | Note | ApprovedBy | ApprovedAt | ApprovalNote | CreatedBy | CreatedAt | UpdatedBy | UpdatedAt`.
  Lines are the paired `TRANSFER_OUT`/`TRANSFER_IN` rows in `StockMovements`
  (SourceType `TRANSFER`, SourceId = TransferId), written only when the transfer is counted
  (`created`). Pending/rejected transfers keep their lines in a **`StockTransferItems`** sheet
  (`TransferId | ProductId | Qty | SerialNumbers`) so they can be shown and approved.
- **`SafetyStock`** (new) — `WarehouseId | ProductId | Qty | UpdatedBy | UpdatedAt`; one row per pair.
- **DR approval fields** — new `DeliveryReceipts` columns **U: ApprovedBy, V: ApprovedAt, W: ApprovalNote**.

### Stock calculation (`src/lib/inventory/`)

`onHand(warehouse, product) = Σ StockMovements.Qty (status ≠ void, date ≥ opening date)
 − Σ DR line qty (DR counted status, DR.WarehouseId = warehouse, DR date ≥ opening date)`.

The opening date for a warehouse+product is the date of its `OPENING` movement. A tracked
product with no opening count has on hand 0. One function loads movements, safety stock, DR
headers and DR items once and returns the whole on-hand table; the page and the checks both use
it. DR lines are matched by `productId` (new DRs always carry it).

### Stock check and lock

A shared `checkStock(warehouseId, lines, excludeSource?)` returns per line: `ok`,
`needs_approval` (with how much safety stock is used), or `blocked` (with shortfall). When
editing an existing DR/transfer, its own current quantities are excluded first. All writes that
can reduce stock (DR create, DR edit, DR status change into a counted status, DR approval,
transfer create/approve, negative adjustment) run inside a single inventory write lock, modelled
on `src/lib/ftiWriteLock.ts`, so the check and the write are atomic. Untracked products are
skipped.

### DR changes

- DR form: required "From warehouse" select; live per-line hint ("8 on hand · 4 safety · 4
  available"); on save, blocked lines stop the save with the shortfall; lines needing approval
  show a confirm ("Needs approval: uses 2 of 4 safety stock at Main Warehouse") and save as
  `pending_approval`.
- Pending DRs: not printable, shown in the register with a "Pending approval" badge; editable by
  the creator (re-checked on save).
- Editing a counted DR re-runs the check; if it now needs approval it moves to
  `pending_approval`.

### Pages

- **Inventory** (`/dashboard/inventory`): table of tracked products × warehouse with on hand,
  safety stock (editable inline for Manage), available; filters by warehouse/category/search;
  negative or below-safety rows highlighted; click a row for its movement history (entries,
  transfers, DRs, with links).
- **Stock Entries**: "Add stock entry" form (type list filtered by access level); bulk-friendly
  for the opening count (one warehouse, many product rows at once).
- **Stock Transfers**: register + create form + optional printable slip.
- **Approvals**: pending DRs and transfers with what they'd consume; approve/reject with note.
- **Product Categories**: "Track inventory" switch.

## Calls made while writing this up (Claude's, for Chris to check)

- **Every reduction is blocked below zero, not only new DRs.** Voiding a RECEIVED/OPENING
  entry, cancelling a transfer (takes stock back out of the *to* warehouse), changing a DR's
  warehouse, or promoting a draft/pending DR all run `checkStock` inside the inventory lock.
- **One OPENING per warehouse+product.** A second one is refused. To redo it, a Manage user
  voids the first and enters a new one. Later recounts are recorded as `ADJUSTMENT` rows
  (counted − system), not as new openings.
- **Dates:** on-hand is always "as of now" (all counted rows). For tracked products, DRs,
  transfers and entries cannot be dated before that warehouse+product's opening date, so
  back-dating cannot skip the check.
- **Transfers after `created`:** not editable. They can be cancelled (Operate level and up). Cancel
  voids its paired movements, and is blocked if the *to* warehouse no longer has the stock.
- **Pending/rejected DRs behave like drafts for everything else:** no DR number yet, no
  delivery handover task, no Sales Order fulfillment, and they don't reserve SO quantity. These
  run when the DR becomes `created` on approval.

## Left to the builder

- Exact UI layout, routes and sidebar placement (follow existing dashboard patterns and the
  mobile list pattern).
- Transfer number format (follow DR/SO numbering conventions).
- Whether pending DRs get a DR number at save or at approval (prefer matching how drafts work
  today: number assigned when it becomes `created`).
- Caching of the on-hand table within a request.
- Unit handling: DR quantities are treated as the product's own unit (no conversion).
