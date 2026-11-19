# Delivery Serial Numbers and Warranty Lookup — Design

Date: 2026-11-19
Status: Awaiting Chris's approval

## Intent

Staff check warranty by finding when a machine was delivered to a customer (e.g. a
Reprocessing Machine delivered to ZODIAC HEALTH VENTURES INC. (HCCH)). Today that means
opening delivery receipts one by one: the register search ignores item names and the Items
column only shows a count. Warranty is normally **1 year from the delivery date** (the
completion report is done on delivery and is not in the system yet). Machines carry serial
numbers, which tell two machines of the same type apart, but serials are only on the
printed DR, not in the system.

## Goals

- Find past deliveries of a product to a customer from the Delivery Release register in one search.
- Record serial numbers on DR lines from now on, printed on the DR.
- Show a warranty status on every delivered item that has a serial number.
- Flag lines in serial-required categories that are missing serials.

## Non-goals

- Backfilling serials onto existing DRs (old serials stay on paper; item-name search still finds old DRs).
- Completion reports, service-history links, per-category warranty periods.
- A separate delivered-units register (approach B below; can be layered on later).
- Duplicate-serial detection across DRs.

## Anti-goals

- Blocking DR save or print because a serial is missing.
- Showing a warranty status on items without serials (would imply warranty terms we don't know).
- Breaking the A4 DR print layout.

## Approaches

- **A. Serials on the DR line, surfaced in the register (chosen).** New column on
  `DeliveryReceiptItems`; register search matches item text and serials; rows show items,
  serials and warranty tags. One source of truth, so DR edit/cancel/delete stays consistent for free.
- **B. Separate "Delivered Units" sheet + Units & Warranty tab.** Cleanest warranty view and a
  future home for completion reports, but a second copy of data that must be kept in sync on
  every DR edit/cancel/delete. Rejected for now.
- **Search-only (no serials).** Cannot tell two machines of the same type apart. Rejected.

Chris picked A.

## Decisions (agreed with Chris)

1. Every DR line has an **optional** serial field, regardless of category.
2. Each product category gets a **"Requires serial"** switch. Only **RE — Reprocessing Machine**
   starts on. Lines in a requiring category with fewer serials than quantity get a
   **"Serial missing"** flag. Never blocks save or print.
3. **Warranty applies to any line with at least one serial**: warranty end = DR delivery date + 1 year.
4. Serials print on the DR.
5. Only new deliveries get serials; no backfill.
6. **Serials stay editable on Completed DRs** (everything else on a Completed DR stays locked),
   so a "Serial missing" flag can always be resolved later.

## Design

### Data

- `DeliveryReceiptItems` gains **column K `SerialNumbers`**: the line's serials joined with `, `.
  Read range grows `A2:J` → `A2:K`; `replaceDeliveryItems` writes 11 columns. Missing/blank = no serials.
- `DeliveryItem` gains `serialNumbers?: string[]`.
- `ProductCategories` gains **column E `RequiresSerial`** (`TRUE`/`FALSE`, blank = false).
  `ProductCategoryRecord` / `ProductCategory` gain `requiresSerial: boolean`. Read range `A2:D` → `A2:E`;
  create/update write column E.
- No new sheets. Existing rows need no migration (blank = no serials / not required).

### Product Categories page

- A "Requires serial" checkbox in the add/edit form and a column/badge in the table.
- After deploy, Chris turns it on for RE (or the builder sets RE's cell to `TRUE` as a one-off data step — builder's call, note it in the handoff).

### DR create and edit forms

- Each line gets a "Serial no(s)." input under/next to the description. Entry is free text;
  split on commas or new lines, trimmed, blanks dropped, stored as a list.
- Applies equally to manual lines, product lines and Sales-Order-sourced lines.
- If the line's product category requires serials and `serials.length < quantity`, show an inline
  amber "Serial missing (n of q)" hint. If `serials.length > quantity`, show a soft "more serials than quantity" hint. Neither blocks.
- Manual lines with no product never require serials.

### Editing serials on Completed DRs

- Completed DRs show an **"Edit serials"** action in the register (next to Preview). It opens a
  small dialog listing the DR's lines (description, quantity) with only the serial input editable.
- Server side: a serial-only update path (e.g. `PATCH /api/deliveries/[id]/serials`) that accepts
  `{ deliveryReceiptItemId, serialNumbers[] }[]`, changes **only column K** of the matching
  `DeliveryReceiptItems` rows, and rejects any other field. Allowed for created and completed DRs;
  rejected for deleted/cancelled. Same auth as DR edit. Must not touch Sales Order fulfillment.
- Lines without a `deliveryReceiptItemId` (legacy rows) are not editable through this path; the dialog shows them read-only.
- The full edit flow for non-locked DRs keeps editing serials inline as part of the normal save.
- Reprinting a Completed DR after a serial edit uses the existing print path and picks up the new serials.

### Register

- **Search** matches, in addition to today's fields, each item's description, product code and
  serial numbers. Search becomes **word-by-word**: every word in the query must appear somewhere in
  the receipt's fields, so `HCCH reprocessing` works. Change scoped to the DR register (do not
  change the shared `matchesDocumentSearch` behavior for other pages; add a DR-local matcher or an opt-in helper).
- **Items column** lists item names (up to 3, then "+N more") instead of only a count. Under each
  item with serials: the serials and a warranty tag —
  - `Under warranty until MMM D, YYYY` (green) when today ≤ end date
  - `Warranty expired MMM D, YYYY` (muted) otherwise
  - `Serial missing` (amber) for required-category lines short on serials.
- Same information appears in the DR view modal for the full item list, and in the mobile list layout.
- Draft, cancelled and deleted DRs show serials but **no warranty tag**.

### Warranty calculation

- A small pure helper: `warrantyEnd(deliveryDate) = addYears(deliveryDate, 1)` using `date-fns`
  (already a dependency); Feb 29 → Feb 28. Status compares against today's local date, inclusive.
- Delivery date parsing must handle the formats already stored in the DR sheet's Date column
  (reuse the existing DR date parsing; do not invent a new one).

### Print

- In `populateDRTemplate`, after each item row with serials, emit one extra row in the description
  column: `S/N: A123, B456` (quantity and unit cells blank). Builder's call on exact styling.
- No item-row limit is enforced today (template body is rows 13–35). Serial rows consume that space;
  keep current overflow behavior and note it — do not add a new limit in this change.

## Testing

- Unit tests (existing `scripts/delivery-release-tests` style): serial parsing, warranty end/status
  (incl. Feb 29 and the boundary day), missing-serial rule, word-by-word DR search matching items and serials.
- Sheet mapping round-trip for column K and category column E (blank/legacy rows).
- Manual: create a DR with an RE item and serials → print shows `S/N:` row → register search by
  customer + "reprocessing" and by serial finds it with the warranty tag.

## Left to the builder

- Exact UI placement/styling of the serial input and tags (match existing DR form and mobile patterns).
- Whether to set RE's `RequiresSerial` via the UI or a one-off sheet edit.
- Column header text in the sheets (`SerialNumbers`, `RequiresSerial`).
