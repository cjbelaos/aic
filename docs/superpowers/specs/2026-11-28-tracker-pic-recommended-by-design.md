# Sales Order Tracker PIC = Recommended By (design)

Date: 2026-11-28 · Size: small change · Status: awaiting approval

## Intent

The `PIC` column (U) on the **Sales Order Tracker** tab
(spreadsheet `14G57IKQ73FCxjZyba216vZlsbsqPYsgPGsjVKzcyzwY`, sheet id `994239522`)
should show the **Recommended By** technician of the Sales Order, as their full name.
That person comes from the source quotation on conversion and can be changed on the Sales Order form.

Today the Tracker sync writes `order.assignedToUserId` to U. That is an ID, not a name, and it is
always blank for converted orders. It also overwrites any PIC picked by hand on every re-sync.

## Decisions (Chris)

- PIC = Recommended By (`order.recommendedByName`, full name).
- Remove the PIC dropdown (strict list: Atillano, Jerico, Jhon Jhon, Jodillo, Admin).
- Sales Order is the source of truth (option B):
  - App rows get the order's Recommended By name, overwriting what's in the cell.
  - If the order has no Recommended By, keep whatever is already in the cell.
  - Existing app-created rows are backfilled.
- Backfill via a one-off PIC-only script (approach 2), not a full re-sync.

## Goals / non-goals

- Goal: new and re-synced Tracker rows carry the Recommended By full name in U.
- Goal: existing app rows (AppSalesOrderId in X) backfilled; no other cell changes.
- Goal: no dropdown on U.
- Non-goal: rows from before the app (no X value). Their short names stay untouched.
- Non-goal: mapping short names to full names; changing Assigned To; changing quotations.
- Anti-goal: the backfill must not touch columns other than U, nor any non-app row.

## Approaches considered

1. Re-sync every order via `syncSalesOrderToTracker`. Rejected: it rewrites A:P and U:V on every row,
   which loses hand fixes, and it reads the whole sheet per order, which risks Sheets quota errors.
2. **Chosen:** a one-off script reads all orders and the Tracker once, then batch-writes only U on
   app rows whose order has a Recommended By. It is a dry run by default and writes only with `--apply`.

## Design

**Ongoing sync:** [src/lib/salesOrders/trackerWriter.ts](../../../src/lib/salesOrders/trackerWriter.ts)
- U value = `order.recommendedByName.trim()` when non-empty; otherwise the row's current U value
  (already available from the existing A:AE read; `""` for a new row).
- `projectTrackerLine` takes the existing PIC as an input so it stays a pure function.
- Removed order lines are still fully cleared, including U (unchanged behaviour).
- Payload hash keeps covering U. Nothing reads the hash, so this is safe.
- If Recommended By is later cleared on the order, U keeps its last value (follows the "blank keeps" rule).

**Backfill + dropdown removal:** new `scripts/backfill-tracker-pic.mjs`
- Reads every Sales Order (recommendedByName keyed by salesOrderId) and Tracker A:AE once.
- For each row with an AppSalesOrderId whose order has a non-empty name that differs from U: plan a U write.
- Dry run prints row number, tracker no., current U → new U, plus totals. `--apply` writes
  one `values.batchUpdate` (RAW).
- `--apply` also sends one `setDataValidation` with no rule over U2:U{rowCount} to remove the dropdown.

## Left to the builder

- Script plumbing: follow existing scripts such as `scripts/migrate-billing-type-column.mjs`
  for auth and env loading.
- Tests: add a unit check for the PIC rule (name wins; blank keeps the existing value; new row blank)
  next to the existing sales-order tests.
