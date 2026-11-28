# Inactive Product Replacement & Admin Notifications — Design

Date: 2026-11-28
Status: Draft, awaiting Chris's approval

## Intent and why

Admins clean up the product master by deactivating **duplicate products**: the same item entered
twice, sometimes under a slightly different name or description. One product is kept as the real
one for inventory. Every document still in progress that points at the duplicate must then be
switched to the kept product. Today nothing does this, and nothing tells anyone it needs doing:
pickers hide inactive products and Delivery Releases reject them, but existing documents keep the
duplicate silently.

This feature lets an admin replace a duplicate with the kept product across all in-progress
documents in one confirmed action. It also gives admins a bell that lists every in-progress
document still using an inactive product, so nothing is left behind.

## Goals

1. When deactivating a product, the admin can pick a **replacement product**. The app previews every
   in-progress document line that would change, plus everything it will skip and why. On
   confirmation, it swaps them all.
2. The same "Replace with…" action is available on a product that is **already inactive**, so the
   existing backlog of past deactivations can be cleaned up.
3. A **bell in the app header**, visible to Admin users only, shows a count and a "needs attention"
   list: every in-progress document that still references an inactive product.
4. Every replacement is **recorded**: each changed row with its old values, who did it, and when.

## Non-goals

- No email or other off-app notification (Chris chose the bell alone).
- No read/unread state. An item disappears from the list when its document is fixed.
- No changes to finished records: Delivery Releases, Service Invoices, Sales Invoices, completed
  or cancelled documents.
- No automatic duplicate detection. The admin decides what is a duplicate.
- No one-click undo UI in this version. The record makes manual or scripted reversal possible.

## Anti-goals (failure even if it "works")

- A replacement that half-applies with no record of what changed.
- Changing anything a customer or supplier already holds a copy of (sent quotations, sent POs).
- Silently creating two active prices for the same customer and product.
- Making the bell so slow or quota-heavy that it degrades the dashboard.

## Constraints

- Google Sheets is the database. There are no transactions and read quotas are limited.
- Next.js 16 line. Check `node_modules/next/dist/docs/` before writing route or caching code.
- Admin = `isAdminUser()` in `src/lib/auth/session.ts` (role 1 or super admin).
- Documents store `productId` plus snapshots (`productCodeSnapshot`, `productNameSnapshot`, or
  equivalents). Proforma Invoices store items as JSON in a cell.
- Current behaviour to preserve or adjust: `DELETE /api/products/[id]` deactivates the product **and
  all its active customer prices** (`src/app/api/products/[id]/route.ts`).

## Scope: what counts as in progress (agreed with Chris)

| Document | Swapped when | Left alone (finished) | Listed in bell instead of swapped |
|---|---|---|---|
| Customer Contracts (`ContractItems`) | contract Active | Expired, Closed, Inactive | — |
| Sales Orders | Draft, Confirmed, On Hold; line ACTIVE with nothing fulfilled | Cancelled, Closed; cancelled lines | lines partially fulfilled (builder's call below) |
| Purchase Requests | Draft, Open, Partial; line not yet ordered | Completed, Cancelled | lines already linked to a PO |
| Quotations | Draft, Saved | — | **Sent** (left unchanged; admin decides whether to revise) |
| Purchase Orders | not yet sent or received | received / closed | **sent** (left unchanged) |
| Proforma Invoices | Draft | Issued, Cancelled | — |
| Contract Releases | Pending | Completed, Cancelled, Deleted | — |
| Customer Prices | active | inactive | conflicts (see below) |
| Supplier Products | active | inactive | conflicts (see below) |
| Delivery Releases, Service Invoices, Sales Invoices | never | always | never |

The builder confirms the exact status values per document from `src/types/*` and maps them to
these categories in one place (a single scope table in code).

### Price lists

- If only the duplicate has an active price for a customer, the price moves to the kept product.
- If **both** the duplicate and the kept product have an active price for the same customer
  (or supplier), it is a **conflict**. The preview shows both. The default is to keep the kept product's
  existing price and deactivate the duplicate's, matching today's deactivate behaviour. The admin
  sees each conflict before confirming. *(Confirmed by Chris on 2026-11-28: no per-customer choice needed.)*
- With no replacement (genuine discontinuation), today's behaviour stays: the duplicate's prices
  are deactivated.

## Approaches considered

**A. Live re-check with a short cache (chosen by Chris).** The bell's list is computed on the
server by reading the product list and the item rows of each in-scope document type, then
filtering to in-progress documents with an inactive `productId`. The result is cached for about
5 minutes and invalidated straight away after a replacement. It is correct by design, covers the
backlog automatically, and needs no changes to document save paths. Cost: about 10 sheet reads per
refresh, and up to 5 minutes of lag after manual edits.

**B. Stored issue list.** A new sheet is updated whenever documents or products change, so the bell
is instant. Rejected: it needs hooks in about 10 save, edit and cancel paths, drifts if one is
missed, and still needs a backlog scan.

## Design

### 1. Scanner (server, `src/lib/inactiveProducts/` or similar)

- `findInactiveProductUsages()` returns a list of usages:
  `{ documentType, documentId, documentNo, lineId, productId, productCode, productName, documentStatus, disposition }`,
  where `disposition` is `replaceable` or `needs_manual` (with a reason: sent, partially fulfilled,
  linked to PO, price conflict, no replacement chosen).
- Reads each in-scope sheet once. Joins to the product list. Applies the scope table.
- Optional `productId` filter, used by the replacement preview.
- Cached for about 5 minutes (use the Next 16 caching API per the local docs). Invalidated by a
  replacement, a product deactivation or a reactivation.

### 2. Replacement (server)

- `previewReplacement(fromProductId, toProductId)` returns the scanner's usages for `fromProductId`,
  split into *will change*, *will skip (reason)* and *price conflicts*.
- `applyReplacement(fromProductId, toProductId, actor)`:
  1. Validates that `toProductId` is active and differs from `fromProductId`.
  2. Writes a **replacement record** first (new sheet, e.g. `ProductReplacements` with header
     `replacementId, fromProductId, toProductId, actor, startedAt, finishedAt, status` and
     `ProductReplacementRows` with `replacementId, sheet, rowKey, column, oldValue, newValue,
     appliedAt`).
  3. Re-reads each affected row immediately before writing, applies the change, and appends the
     row record. On each swapped line, `productId` and the code and name snapshots change to the
     kept product. **Price, quantity, description and discounts are unchanged.**
  4. Marks the record `completed`, or `partial` with the error if a write fails. It never claims
     success on a partial run, and the UI shows what was and wasn't applied.
  5. Deactivates `fromProductId` if it isn't already inactive, then invalidates the scanner cache.
- Respects existing per-document concurrency guards. Sales Orders have a `version` field.
  Contracts have `contractIntegrity`. Quotations have `quotationLock`. If a guard rejects a row,
  that row is reported as skipped, not forced.

### 3. API

- `GET /api/admin/inactive-product-usages` (admin only) returns the bell list grouped by product.
- `GET /api/products/[id]/replacement-preview?to=<productId>` (admin only).
- `POST /api/products/[id]/replace` with `{ toProductId }` (admin only) returns the replacement result.
- The existing `DELETE /api/products/[id]` stays for deactivate-without-replacement.

### 4. UI

**Products page: deactivate dialog** gets an optional "Replaced by" product picker (active
products only, excluding itself). Leaving it blank keeps today's behaviour. Picking a product shows
the preview:

```
Replace  GPC-0012 Copper Pipe 1/2"  →  GPC-0004 Copper Pipe ½ in

Will update (14)
  Customer Contracts   CTR-0031, CTR-0047 (3 lines)
  Sales Orders         SO-2026-0112, SO-2026-0130
  Purchase Requests    PR-0221 (2 lines)
  Customer Prices      ABC Corp, XYZ Inc

Skipped — needs your review (3)
  Quotation  Q-2026-0410   already sent to customer
  Sales Order SO-2026-0098 line 2 partially delivered
  Price conflict  ABC Corp has prices on both (₱120 vs ₱115) → keeping ₱115

                                   [Cancel]  [Replace & deactivate]
```

**Products page: inactive product row** gets a "Replace with…" action that opens the same dialog.
This is for the backlog.

**Header bell** (admin only, in the dashboard layout next to `user-menu.tsx`) shows a count badge
of affected documents. The dropdown lists items grouped by inactive product. Each item has the
document number linked to its page, the reason, and a "Replace with…" link to the product. Empty
state: "No documents use inactive products." The count is fetched when the page loads and when the
bell opens. No polling.

## Left to the builder

- Exact status-value mapping per document type, and the exact sheets and columns holding
  `productId` and snapshots (including the Proforma JSON items and Quotation detail rows).
- Sales Order lines with partial fulfillment: the default is *skip and list*, so the line stays tied to
  its delivered product. Same for PR lines already linked to a PO.
- Cache mechanism details and the invalidation hook, per the Next 16 docs.
- Where the replacement record sheets live (the main database spreadsheet is the default).
- Tests: scope-table unit tests per document type, a preview/apply test with a fake sheet client,
  partial-failure reporting.

## Calls Claude made (for Chris to check)

1. The bell goes to everyone with the Admin role (`isAdminUser`).
2. Swapped lines take the kept product's code and name. Price and quantity stay the same.
3. Price conflicts default to keeping the kept product's existing price, shown in the preview.
4. Partially delivered SO lines and PR lines already on a PO are skipped and listed, not swapped.
5. Replacement also works on already-inactive products (backlog cleanup).
6. No undo button in v1. The replacement record allows reversal.
