# Service Invoice → Accounting Tracker Sync — Design

Date: 2026-11-23 · Status: awaiting approval

## Intent

Service invoice rows in the accountants' **INVOICE AND PAYMENT TRACKER** were typed by hand
from the paper copies. Chris now owns that job. Every service invoice already exists in the app's
`ServiceInvoices` database, so the app should copy each one into the tracker and keep it current.
The goal is zero manual typing from invoice 1801 onward.

- Target: spreadsheet `1izCz-qWLqLhAxOeUtn8qp11iLpdxRn3qnhxumutB43A`, tab **Service Invoice**
  (sheet ID `449964054`). Same workbook the proforma sync writes to (`src/lib/proforma/tracker.ts`).
- Source: database tabs `ServiceInvoices` and `ServiceInvoiceItems` (via `invoiceRepository.ts`, kind `"service"`).

## Goals

- Every app service invoice numbered **≥ 1801** appears on the tracker with columns A–H and J filled.
- Rows update automatically when an invoice is created, edited, voided, cancelled, or deleted.
- A failed copy never blocks saving an invoice, and it never goes unnoticed.
- A **Sync to tracker** button fills anything missing or stale, and it handles the first run.

## Non-goals

- Invoices **below 1801**. They are never read for writing or changed, even when they differ from the app.
- Columns I and K–Y (Classification, VAT/EWT/Net formulas, payments, 2307, OR, Remarks, aging).
  Accountants own them. The single exception is the one-time 1811 remark (below).
- Sales invoices / the `Sales Invoice` tab.
- A "spoiled paper" feature in the app (deferred until it recurs).

## Anti-goals (failure even if it "works")

- Overwriting an accountant's payment data or a formula.
- Overwriting a row from before 1801, or a hand-filled row in the ≥1801 range the app didn't write (see Row ownership).
- Writing a customer name the tab's strict dropdown rejects, leaving TIN/Address blank.
- An invoice silently missing from the tracker.

## Tracker facts (verified read-only, 2026-11-23)

- Header row 1: `Category, Purchase Order No., Date, Invoice No., Customer Name, TIN, Address,
  Description, Classification, Total Amount, VAT, EWT, Net Amount, Paid Amount, Balance, …`
  Remarks is column V.
- **Invoice numbers are pre-typed in column D** as zero-padded text (`"0944"`, `"1801"`), up to 1885.
  Invoice 1801 is row 859, and rows continue one per number.
- A: strict dropdown `Contracted | Service`. C: date-valid. E: strict dropdown on
  `'Client Directory'!$B$2:$B`. F/G: `xlookup` formulas into Client Directory (TIN = col F, Address = col G).
- `Client Directory` columns: `(blank), Company Name, Contact Person, Contact Number, Email, TIN, Address`.
- Existing cancelled convention: B = `CANCELLED`, A and J blank, E/H kept.
- Within 1801–1843: 39 empty placeholders and 3 hand-filled rows (1809, 1822, 1838).
  1811 is a spoiled paper and is not in the app.
  Four app customers are missing from Client Directory, two of them only by a trailing space.

## Field mapping (columns the app owns)

| Col | Value |
|---|---|
| A Category | `Contracted` if the invoice came from a contract release, i.e. `ContractId` (ServiceInvoices col K) is set. Otherwise `Service`. Blank when cancelled/void/deleted. |
| B Purchase Order No. | `PONumber` (col Q; the linked DR/SO value already resolves into it). Blank if none. `CANCELLED` when cancelled/void/deleted. |
| C Date | Invoice date written as a date serial, formatted `mmm d yyyy` like the proforma sync. |
| D Invoice No. | Matching key only. Not rewritten when the row already exists. |
| E Customer Name | App company name (Companies col C) of the billed `CustomerId`. |
| F/G | Left as the lookup formulas. If a row lacks them, copy the formula from an existing data row (the proforma pattern). |
| H Description | **Linked Sales Order** (ServiceInvoices col S): that SO's `SalesOrderItems` with `LineStatus = ACTIVE`, in `LineNo` order, `Description` text exactly as stored, one per line. Example: SI 1841 → AIC-SO-2026-1470 gives `REPLACEMENT OF DIGITAL HEAD (WATER SOFTENER)` and `WATER SOFTENER REBEDDING (16x62)`; the INACTIVE line is excluded. **No linked SO** (contract PMS, TR-number, standalone invoices): the invoice's own item lines in order, exactly as printed, one per line. Render-only `notation` rows are excluded. Kept when cancelled. |
| J Total Amount | `invoiceTotals(...)` from `src/lib/serviceInvoiceDiscounts.ts`, the same total printed on the invoice after discount. Blank when cancelled/void/deleted. |

Drafts are never written. A draft has no paper number yet.

## Row ownership and safety

- **Find the row** by matching column D to the invoice number, ignoring leading zeros.
  No match → append after the last row with a number in D, writing D as 4-digit text
  and copying F/G formulas and the A/C/E validations from an existing data row.
  More than one match → stop for that invoice and report it.
- **Ownership marker:** the app records each row it wrote in the invoice's metadata JSON
  (ServiceInvoices col T), as `trackerSync: { row, syncedAt, status: "synced"|"failed", error?, values }`.
  `values` is the A–H/J projection the app last wrote.
- **Writable when** the row's A, B, C, E, H, J are all blank (an untouched placeholder), **or**
  the current cells equal the app's last-written `values` (the app owns it and nobody edited it).
  Otherwise the row is **hand-filled or edited by someone**. The app skips it and reports
  "needs review" with what's there vs what the app has. This rule leaves 1809, 1822 and 1838 alone.
  It also stops the app overwriting an accountant's later correction.
- A row whose owned cells now hold a formula is skipped and reported (proforma rule).
- Verify the tracker header row before every write. If it changed, stop and report.

## Client Directory

> **Revised 2026-11-23 (Chris, option A).** The tracker's `Client Directory` tab is an `IMPORTRANGE` of
> **SALES ORDER TRACKER** (`14G57IKQ73FCxjZyba216vZlsbsqPYsgPGsjVKzcyzwY`) → `Client Directory!A1:H500`.
> Writing into the tracker's copy would break the import and every TIN/Address lookup. So names are read from,
> and new customers appended to, **the source**. The tracker's tab is never written. When the source reaches the
> 500-row import limit, the invoice is reported `needs_review` ("extend the IMPORTRANGE"). Override:
> `SERVICE_INVOICE_DIRECTORY_SPREADSHEET_ID`. Below, "Client Directory" means the source.

Before writing E, the customer name must be in `Client Directory` col B, an exact match.

- Missing → append a row: B = name, F = TIN, G = address from the app's Companies record. Other columns blank.
- **Trailing-space names:** the directory's `GLOBAL RENAL CARE SPECIALISTS INC. ` and
  `COMMONWEALTH HOSPITAL AND MEDICAL CENTER ` are left untouched. Rows before 1801 point at them, and trimming
  them would break those rows' lookups. The clean spelling is added as its own entry like any missing name.
  Existing directory entries are never edited.
- The four added today: Global Renal Care, Commonwealth, Healthway Daniel O Mercado – HD2, Green City Medical Center.

## When it runs (approach 3: auto on save + button)

One shared routine, `syncServiceInvoiceToTracker(invoiceNo)` plus `syncServiceInvoicesToTracker()` for all ≥1801, in a new
`src/lib/serviceInvoiceTracker.ts`.

- **Auto:** called after `processServiceInvoice`, `updateServiceInvoice`, `cancelAndCreateCorrectedServiceInvoice`
  (both the cancelled original and the new copy), and `deleteServiceInvoice` succeed. Only for kind `"service"`.
  It runs after the database write and never throws into the save. On failure it records
  `trackerSync.status = "failed"` + error.
- **Button:** "Sync to tracker" on the Service Invoices page, admin only. It runs the batch for every invoice ≥1801 and
  shows a summary: added, updated, unchanged, customers added to Client Directory, needs review, and failed with reasons.
  Clicking it twice changes nothing the second time.
- **Visible flag:** invoices with `trackerSync.status = "failed"` show a small "Not on tracker" marker in the register,
  so a failed auto-sync is seen and fixed with the button.

## One-time first run

The first button press covers 1801–1843 under the rules above. It also writes **1811** as a spoiled paper:
B = `CANCELLED`, A/E/H/J blank, V (Remarks) = `Spoiled – wrong document printed on this form.`
This is the only write to column V, done once by a script or seed and not by the routine.

## Approaches considered

1. **Auto on save only** (like the proforma sync). Always current, but a Google hiccup leaves a silent gap.
2. **Button only.** Simple and safe to rerun, but depends on remembering to click.
3. **Both, sharing one routine** ✅ *chosen by Chris.* Nothing to type and nothing silently lost.
   A timed (cron) sync was dropped: it still needs the button for failures and adds delay.

## Decided by Chris

- App data is the source of truth for rows it writes. Scope starts at **1801**, and nothing earlier is touched.
- Contracted = created via contract release (linked DR), otherwise Service.
- 1811 is recorded as a spoiled/cancelled number.
- Missing customers are added to Client Directory automatically. ("Fix trailing-space names" was revised so earlier
  rows stay untouched: clean names are added alongside, and old entries are kept.)
- Approach 3.
- Description = linked Sales Order's active line items; invoices with no SO use **all** their own item lines.
  Every line is included: SERVICE CHARGE lines (priced or ₱0), ₱0 package and summary lines. No line is filtered by name or price.

## Calls made by Claude (please check)

- Cancelled/void/deleted invoices use the sheet's existing `CANCELLED` format, not a removed row.
- Hand-filled or later-edited rows are skipped and reported, not overwritten (covers 1809/1822/1838).
- If an SO's lines change after the invoice was written (an edit or a line deactivated), the row's description follows on the next sync, unless the row was edited by hand (ownership rule).
- J = discounted invoice total from the shared `invoiceTotals` helper.
- Ownership is tracked in the invoice metadata JSON (col T). No new database column.
- Button restricted to admins (role id 1).
- A deleted invoice that had a row gets the CANCELLED format (its paper number exists).

## Left to the builder

- Exact batching and retry for the batch run (Sheets quota: one `batchGet` for the tab + directory, one `batchUpdate`).
- Placement and styling of the button, summary dialog and "Not on tracker" marker in `service-invoices-client.tsx`.
- Test coverage following the existing `scripts/test-*.cjs` style: mapping, ownership check, directory add, cancelled format.
- Read `node_modules/next/dist/docs/` before touching route handlers (AGENTS.md).
