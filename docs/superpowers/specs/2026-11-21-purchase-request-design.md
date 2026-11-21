# Purchase Request (PR) — Design

Date: 2026-11-21
Status: Implemented on feat/purchase-requests (2026-11-21); requires `npm run setup:purchase-requests -- --apply` before use

## Intent

Technicians need items (parts, consumables, BOM components) to carry out jobs whose quotation is
approved and whose Sales Order already exists. Today they ask informally, and Purchasing has no
reliable record of what was requested. A Purchase Request is the formal ask: a technician
submits it, Purchasing sees it, and Admin releases items only against a PR — whether the items are
already in stock or must be bought.

The PR is **only a request**. It does not move or reserve stock. Stock moves stay with the existing
Stock Transfer; physical release to the technician stays on paper / DR. A PR is "done" when every
line is either on a Purchase Order or marked "From stock" by Purchasing.

## Goals

- Technicians create a PR against one Confirmed Sales Order, listing products and quantities.
- No approval step. Submit → visible to Purchasing immediately.
- Purchasing builds POs by pulling open PR lines; one PO can cover many PRs and one PR can be
  spread over many POs. Identical products from different PRs may be merged into one PO line.
- PR status is always correct, even when a PO is edited, cancelled, or deleted.
- Purchasing can mark PR lines "From stock" (covered by existing stock / Stock Transfer).
- A4 print of the PR in the same style as the PO print.

## Non-goals

- Bill of Materials / recipes. Technicians add BOM components by hand (future: auto-fill from BOM).
- Any inventory effect (no stock deduction, reservation, or availability check on the PR).
- Recording the hand-over of items to the technician.
- Approval workflow, email notifications.
- Free-text (non-catalog) items — all items are products from the product list.
- Prices on the PR (Purchasing prices on the PO).
- Receiving goods against a PO.

## Anti-goals

- PR showing "PO Created" for a PO that was cancelled or deleted (status drift).
- Breaking the existing PO create/edit/print flows, the A4 PO layout, or PO numbering.
- Over-ordering silently: a PO pulling more of a PR line than is still open without the user seeing it.

## Approaches

- **A. Derived status via a link sheet (chosen).** A `PurchaseRequestLinks` sheet stores one row
  per (PO, PO line, PR line, quantity). A PR line's ordered qty is always computed from links whose
  PO is not Draft/Cancelled/Deleted. Edits/cancels/deletes of POs automatically reopen PR lines;
  merged PO lines are supported. Same philosophy as the inventory module (derive from source docs).
- **B. Stored "ordered qty" counter on PR lines**, updated by every PO write path. Faster reads but
  drifts if any path is missed. Rejected.
- **C. Single PR-line reference column on PO items.** Simplest, but no merging of identical items
  across PRs. Rejected.

Chris picked A.

## Decisions (agreed with Chris)

> **Amended 2026-11-21** by `2026-11-21-pr-contract-items-design.md`: a PR may be for a Sales Order, a
> Customer Contract, or neither (decision 1); typed non-catalog items are allowed (decision 4,
> non-goal "Free-text items"); the print uses Requested / Noted / Reviewed / Approved by (decision 8).

1. **One PR ↔ one Sales Order.** Only Confirmed Sales Orders can be selected.
   Picking the SO fills (snapshots) customer name, quotation no., and delivery address.
2. **Raised by technicians.** "Requested by" = the logged-in user.
3. **No approval.**
4. **Items are products only.** Two ways to add: "Add from Sales Order" (copies SO product lines,
   qty editable) and "Add product" (any active product — for BOM components and consumables not on
   the SO). Each line may optionally reference the SO line it is for ("for: Chiller unit, line 1").
5. **No prices on the PR.**
6. **PO ↔ PR is many-to-many at line level** (approach A). PO lines may merge the same product from
   several PR lines; the PO line qty is the sum of its linked quantities plus any extra.
7. **"From stock":** Purchasing can mark a PR line (or the remaining qty of it) as From stock, with
   an optional note (e.g. warehouse / Stock Transfer no.). It can be undone.
8. **A4 print, PO style.** Signature boxes: **Requested by** (technician) and **Received by**
   (Purchasing).
9. **Access.** Any logged-in user can create a PR and see all PRs; only the requester (or Admin)
   can edit/cancel a whole PR. **Anyone** logged in can mark lines From stock and undo it. The PR
   form reads Confirmed Sales Orders through a new narrow, read-only endpoint (SO no., customer,
   quotation no., delivery address, product lines). This does **not** open the Sales Orders module
   (which stays Admin-only per `src/lib/salesOrders/permissions.ts`). The PO picker is available to
   whoever can use the PO form today (any logged-in user).
10. **Cancel line.** The requester or anyone acting as Purchasing can cancel the *remaining*
    (un-handled) qty of a line, with a required reason. Qty already linked to a PO or marked From
    stock is untouched. Store as `cancelledQty`, `cancelReason`, `cancelledBy`, `cancelledAt` on the
    line; a line is fully cancelled when `cancelledQty` = its whole remaining qty.
11. **Sales Order leaves Confirmed** (On Hold / Cancelled / Closed). Existing PRs are unchanged but
    show a warning badge (with the SO status) in the register, PR view, and PO picker. A Draft PR
    cannot be submitted against a non-Confirmed SO. Nothing is cancelled automatically.

### Quantity rules (builder-check calls by Claude, accepted by Chris)

- `remaining = quantity − orderedQty − fromStockQty − cancelledQty` (never below 0).
- **No over-ordering of a PR line.** Links can never exceed a line's remaining qty. If Purchasing
  orders more on a PO line, the excess is unlinked "extra" on the PO and does not touch the PR.
  Remaining is computed counting links on Draft POs too, so two drafts can't claim the same qty.
- **Lowering a PO line below its linked qty is blocked** with a message to unlink PR lines first
  (the picker lets the user remove/reduce a PO line's links).
- **From stock** can only cover remaining qty (not qty already on a PO).

## Data model (Google Sheets, database spreadsheet)

**PurchaseRequests** (one row per PR)
`prId, prNo, status, salesOrderId, salesOrderNoSnapshot, customerNameSnapshot,
quotationNoSnapshot, deliveryAddressSnapshot, requestedByUserId, requestedByName, requestedDate,
neededByDate, purpose, cancelReason, version, createdAt, createdBy, updatedAt, updatedBy`

**PurchaseRequestItems** (one stable-ID row per line)
`prItemId, prId, lineNo, productId, productCodeSnapshot, productNameSnapshot, unitId,
unitSnapshot, quantity, salesOrderItemId (optional "for" reference), remarks,
fromStockQty, fromStockNote, fromStockBy, fromStockAt, cancelledQty, cancelReason, cancelledBy,
cancelledAt,
createdAt, createdBy, updatedAt, updatedBy`

**PurchaseRequestLinks** (PO ↔ PR allocations)
`linkId, poNumber, poItemNo, prId, prItemId, quantity, createdAt, createdBy`

Important: PO items today have no stable IDs — `replacePurchaseOrderItems` deletes and rewrites
all of a PO's rows on each save, keyed by `poNumber` + `itemNo`, and Draft POs are renamed from
`DRAFT-…` to a real number on finalize (`renamePurchaseOrderItemReferences`). Therefore links are
keyed by `poNumber` + `poItemNo`, are **replaced wholesale** whenever the PO's items are saved, and
are **renamed** alongside PO items on finalize.

## Numbering

`AIC-PR-YYYY-NNNN`, allocated on submit (drafts have no number, like Sales Orders), sequence
resets yearly. Reuse the Sales Order sequence pattern.

## Status

PR status is derived, never edited directly (except Draft/Cancelled):

| Status | Meaning |
|---|---|
| Draft | Saved, not submitted; only the requester sees/edits it |
| Open | Submitted; no line handled yet |
| Partially handled | Some qty ordered or from stock, not all |
| Completed | Every line: orderedQty + fromStockQty + cancelledQty ≥ requested qty, and at least one unit ordered or from stock |
| Cancelled | Cancelled by requester (only allowed while nothing is handled) |

If every line is fully cancelled and nothing was ordered or from stock, the PR becomes Cancelled.

Per line: `handled = orderedQty + fromStockQty + cancelledQty`, where
`orderedQty = Σ link.quantity for links whose PO status ∉ {draft, cancelled, deleted}`.
Links on Draft POs show as "on draft PO" but do not count as ordered.

The requester may edit or cancel a PR only while no line has any link (any PO status) or
From stock mark.

## Screens

1. **Purchase Requests register** (`/dashboard/purchase-requests`, sidebar near Purchase Orders):
   DocumentRegisterHeader style status cards (All / Draft / Open / Partially handled / Completed /
   Cancelled), search, filters by Sales Order, requester, date. Row actions: View, Edit, Print,
   Cancel.
2. **PR form** (create/edit modal or page, matching the PO page's pattern):
   ```
   PR No. (auto on submit)          Date requested: today
   Sales Order: [Confirmed SOs ▾] → Customer, Quotation No., Delivery address (read-only)
   Requested by: (logged-in user)   Needed by: [date]   Purpose / Job notes: [text]
   #  Product   Qty   Unit   For SO line (optional)   Remarks
   [+ Add from Sales Order] [+ Add product]           [Save draft] [Submit]
   ```
3. **PR detail view:** lines with Requested / Ordered (with PO numbers) / From stock / Remaining;
   "Mark from stock" and "Cancel remaining" actions per line; SO-status warning badge.
4. **PO form change:** an "Add from Purchase Requests" picker listing open PR lines (remaining > 0),
   filterable by PR, product, Sales Order. Selecting lines adds PO lines (pre-filled product, unit,
   qty = remaining, supplier product match where available); selecting the same product from several
   PRs offers to merge into one line. Qty above remaining requires a confirmation. The PO's existing
   free-text `prNumber` field becomes derived: comma-separated PR numbers from its links (kept as a
   column for print/back-compat; manual entry still allowed for POs with no links).
5. **Print:** A4 PR document styled like `purchase-order-print-document.tsx` — header, PR No., date,
   SO No., customer, quotation no., needed-by, purpose, item table (#, code, description, qty, unit,
   for, remarks), signature boxes Requested by / Received by.

## Constraints

- Next.js 16 line in this repo — read `node_modules/next/dist/docs/` before writing routes/pages.
- Google Sheets is the database; new tabs must be created (and headers verified) by a script like
  `scripts/verify-sales-order-sheet-schema.mjs`.
- Concurrency: PR number allocation and PO-link writes must not double-allocate; reuse the
  existing lock pattern (`src/lib/inventory/lock.ts`) / SO sequence approach.
- A4 PO print layout must be unchanged apart from listing multiple PR numbers.

## Left to the builder

- Exact component structure, modal vs page, and file names (follow the PO and Sales Order modules).
- Whether PR register reads compute status in one pass (load PRs, items, links, PO statuses once).
- Test coverage in the style of `scripts/sales-order-tests` for the status derivation and link
  allocation logic.
