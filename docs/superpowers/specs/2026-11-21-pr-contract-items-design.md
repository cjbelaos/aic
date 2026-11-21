# Purchase Request — Contract Items, Typed Items, Signatories (Design)

Date: 2026-11-21
Status: Draft — awaiting Chris's approval
Builds on: `2026-11-21-purchase-request-design.md` (amends decisions 1, 4, 8 and the "Free-text items" non-goal)

## Intent

Technicians raise PRs for routine monthly contract service and for releasing a customer's entitled
items. Today a PR must point at a Confirmed Sales Order and every line must be picked from the
product list, so contract work can't be requested cleanly. Chris wants:

1. A PR that does **not** require a Sales Order.
2. A quick way to fill PR lines from a customer contract's items, pre-filled with what is still due.
3. Typed-in (non-catalog) items.
4. A cleaner product picker (no product code, except to tell same-named products apart).
5. The company's four-signatory block on the A4 print.

## Goals

- **"Request for"** selector at the top of the PR form: **Sales order** (as today) / **Customer
  contract** / **None**. Sales order is no longer mandatory.
  - Sales order: unchanged behaviour (Confirmed SOs only, snapshots, Add from sales order, For-SO-line).
  - Customer contract: pick an **Active** contract → snapshot contract no. + customer name;
    enables **Add from contract**.
  - None: no reference; customer field empty.
- **Add from contract** opens a checklist of the contract's Active items. Each row shows product,
  frequency, entitled qty, released this period, **due** (= entitled − released, floor 0), and a hint
  of qty already on other PRs this period (e.g. "4 already on AIC-PR-2026-0012"). Ticking rows adds
  lines with qty = **due** (items with due 0 are shown but unticked by default). The hint is
  informational only — it does **not** reduce the pre-filled qty (Chris chose "only show it").
- Each PR line remembers the `contractItemId` it came from (needed for the hint).
- **Typed items:** "Add typed item" adds a line with free-text description + free-text unit + qty,
  no product. Typed lines flow to POs as description-only PO lines (PO items already allow no
  `productId`); the PO picker shows the description and does no supplier-product match for them.
- **Product picker labels:** product name only; append the code (`Name (CODE)`) only when two or
  more active products share the same name.
- **Print signatories** replace "Requested by / Received by" with a 2×2 block:
  - Requested by — line + "SIGNATURE OVER PRINTED NAME / DESIGNATION / DATE"
  - Noted by — line + same caption
  - Reviewed by — line + same caption
  - Approved by — **MAY C. ARQUIZA**, CHIEF FINANCE OFFICER; **ENGR. APOLLO M. ARQUIZA**, CHIEF
    EXECUTIVE OFFICER (fixed text, no lines)
- Print header shows "Sales order" or "Contract" (with its no.) depending on Request for; item table
  shows the product code column blank for typed items.

## Non-goals

- No inventory or release effect: a PR still does not create contract releases or move stock.
- No hard block on over-requesting against a contract.
- No change to the PO A4 layout or numbering.

## Anti-goals

- Breaking existing PRs (all have a Sales Order) or their links to POs.
- Product picker becoming ambiguous for same-named products.

## Approaches

- **A. Add a request-type + contract reference to the PR, and optional contract-item / description
  fields to PR lines (chosen — the one sensible way).** Extends the existing sheets with new trailing
  columns; existing rows read as type "Sales order".
- B. Model contract PRs as a separate document — rejected: duplicates numbering, register, PO picker
  and print for no gain.
- C. Pre-fill from contract releases instead of period summaries — rejected: releases happen at
  delivery; the current-period summaries already hold entitled vs released per item.

Quantity rule for Add from contract: Chris chose **"show it, don't subtract"** over subtracting
qty already on other PRs.

## Data model changes (new trailing columns; setup script adds headers)

**PurchaseRequests:** `requestType` (`SALES_ORDER` | `CONTRACT` | `NONE`; blank ⇒ `SALES_ORDER`),
`contractId`, `contractNoSnapshot`. `customerNameSnapshot` is reused for the contract's customer.
`salesOrderId` may be blank when type ≠ SALES_ORDER.

**PurchaseRequestItems:** `contractItemId`. Typed items have a blank `productId`/`productCodeSnapshot`/
`unitId`; the typed description is stored in `productNameSnapshot` and the typed unit in
`unitSnapshot` (planning call: no separate description column, so every existing display of the
line name keeps working).

**PO link rule for typed items:** a PO line linked to a typed PR line must itself have no product
(description-only); a product PR line still requires the same product on the PO line.

## Server rules

- Validation by type: SALES_ORDER requires a Confirmed SO (existing `requireConfirmed`); CONTRACT
  requires an Active contract; NONE requires nothing. Submit re-checks only for SALES_ORDER (existing
  rule) and CONTRACT (contract still Active).
- `contractItemId` on a line must belong to the PR's contract; `salesOrderItemId` only allowed on
  SALES_ORDER PRs.
- A line needs either a `productId` or a non-empty `description`.
- New narrow read-only endpoint for the form: Active contracts (id/no., customer name) and, per
  contract, its Active items with current-period entitled/released and qty on other non-cancelled
  PRs this period (sum of quantity − cancelledQty on lines with that `contractItemId` from PRs whose
  requested date is inside the item's current period).
- SO-status warning badges apply only to SALES_ORDER PRs.

## Screens touched

PR form, PR detail view, PR register (show "SO …" / "Contract …" / "—" in the reference column;
search covers contract no.), PO "Add from Purchase Requests" picker (shows the reference and typed
descriptions), PR print.

## Calls made by Claude (please check)

- "Request for" has a **None** option (free requests such as shop consumables).
- Requested by keeps today's auto-printed requester name + e-signature above its line; Noted and
  Reviewed by are blank lines to sign by hand.
- Due qty uses the existing `ContractPeriodSummaries` for the current period; if no summary exists
  yet for an item, due = full entitled qty.
- Typed items have a free-text unit field.
- Code-suffix rule applies to the PR line product picker only.

## Left to the builder

Component structure, endpoint naming, and tests in the style of `scripts/purchase-request-tests`
(type validation, due calculation, typed-item → PO line).
