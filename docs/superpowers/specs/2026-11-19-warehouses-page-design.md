# Warehouses Page Improvements — Design (small change)

Date: 2026-11-19
Status: Approved by Chris

## Intent

Warehouses are about to become stock locations for the inventory module (keyed by Warehouse ID)
as well as Purchase Order ship-to addresses. The page must make it impossible to break that link
and be clearer to fill in. No warehouses exist yet, so nothing needs migrating.

## Decisions (Chris)

- No Warehouse ID field in the form. The server assigns `WH-n` (highest existing number + 1); it never changes.
- Required fields are marked: Code, Name, Address lines, City / Province / Postal code.
- **Deactivate instead of Delete.** Rows are never removed; inactive warehouses drop out of every
  picker and can be reactivated.
- Claude's proposals, accepted: unique codes (case-insensitive); hide Company ID (always `COMP-7`,
  still saved); show the ID read-only in the table and edit dialog; rename Sort order to
  **Display order** ("Lower numbers show first in dropdowns"); new warehouses start active (no
  status picker in the form); dialog ignores outside clicks.

## Approaches

One sensible way: improve the existing page, sheet layer and routes in place. A new page or a
rewrite of the data layer would gain nothing; inventory and Purchase Orders already read this sheet.

## Design

- `src/lib/warehouseRules.ts` (pure, tested): `nextWarehouseId(ids)`, `validateWarehouse(input, existing, selfWarehouseId?)`.
- `src/lib/warehouseSheets.ts`: create ignores any client ID and uses `nextWarehouseId`; create and
  update validate with `validateWarehouse`; update never changes the ID or Company ID;
  `setWarehouseActive(id, active)` replaces `deleteWarehouse`.
- Routes: POST/PUT return validation errors as 422; DELETE deactivates; PATCH `{ active }` reactivates.
- Page: columns ID, Code, Name, Address, Contact, Status, Display order; required markers; inline
  dialog errors; Deactivate (confirm) / Reactivate row actions.

## Non-goals

Per-warehouse stock on this page (lives on Stock on Hand); changing who can open the page.

## Left to the builder

Exact layout and copy beyond the above.
