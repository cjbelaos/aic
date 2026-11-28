# Scanned copy file names — design

Date: 2026-11-28
Status: approved approach (A); awaiting doc approval

## Intent

Scanned copies in Google Drive are named today like
`DR-SCANNED_4110_1764300000000_DR_4110.pdf`: upload time and the browser's file
name, nothing a person can read. Anyone browsing the Drive folders should be able
to tell at a glance which document, date and customer a scan belongs to.

## Name format

| Document | Format | Date used |
|---|---|---|
| Delivery Receipt | `DR-{MM}-{DD}-{YYYY}-{DR No.}-{Customer}` | `DeliveryReceipts` sheet, column B `DeliveryDate` (not the scan date) |
| Service Invoice | `SR-{MM}-{DD}-{YYYY}-{Invoice No.}-{Customer}` | `ServiceInvoices` sheet, column B `Date` |
| Sales Invoice | `SI-{MM}-{DD}-{YYYY}-{Invoice No.}-{Customer}` | `SalesInvoices` sheet, column B `Date` |

- `SR` for Service Invoices is intentional (`SI` is Sales Invoice).
- The file extension of the uploaded file is kept (`.pdf`, `.jpg`, `.png`, `.webp`).
- Customer = the name the app shows in the Customer column: company name looked
  up from the Companies sheet, falling back to the stored company ID (e.g.
  `COMP-131`) when the lookup fails.
- Customer names are kept as written (spaces, `.`, `,`, `()` included). Only
  characters that break file names (`/ \ : * ? " < > |` and control chars) are
  replaced with a space, and repeated whitespace collapsed. *(Claude's call.)*
- Example: `DR-11-27-2026-4110-ALABANG MEDICAL CENTER.pdf`

## Goals

1. Every new scan — bulk dialog or single-row upload — is named in this format.
   Naming happens on the server, from the record, so the browser's file name is
   irrelevant.
2. When a scan is replaced, the previously linked file is renamed to
   `{its name} (replaced YYYY-MM-DD)` (date of the replacement, Manila time) so
   it stays in Drive but can't be mistaken for the current one. (Option B.)
3. New Sales Invoice scans are filed in folder
   `1OvWCCqVw0KOSO48KjhcVhcvsweSKG7qY` instead of `166LGOl4qTL4Ukabnrk335OT0ccLQnCq_`.
4. Existing **Scanned copies** — the file each DR / Service Invoice / Sales
   Invoice record links to as its scanned copy — are renamed to the new format,
   and existing Sales Invoice scanned copies are moved into the new folder.

## Non-goals

- Other files in the Drive folders (unlinked or previously replaced scans,
  generated PDFs that aren't the scanned copy) are not touched by the script.
- No automatic rename when a record's date or customer is edited after scanning.
  Re-running the script fixes stale names.
- No change to DR year subfolders, Document Tracker behaviour, or sheet columns.

## Anti-goals

- The script must never rename or move anything without a reviewed dry run first.
- A failure to rename the *old* file on replace must not fail the upload; it is
  reported as a warning like the existing tracker/status warnings.

## Approaches considered

- **A. One-time local script (chosen).** `scripts/rename-scanned-copies.mjs`,
  run with the project's `.env.local`. Default mode is a dry run that writes a
  CSV (record type, number, current name, new name, folder move, skip reason).
  `--apply` performs it. Idempotent: files already correctly named and placed are
  skipped, so it can be re-run later. Chosen because this is a one-off cleanup
  and it adds nothing permanent to the app.
- **B. Admin button in the app** with the same preview. Rejected: new UI and an
  API route to maintain for a mostly one-time job.

## How it's built

**Shared naming helper** (e.g. `src/lib/scannedCopyFileName.ts`): pure function
`scannedCopyFileName({ prefix: "DR" | "SR" | "SI", date, number, customer, extension })`
plus the sanitizer. Used by the three upload routes and the script (the script
is `.mjs`, like the others in `scripts/`; reuse via a small duplicated function
or a `tsx` run is the builder's call). Unit-tested: date conversion from stored
format, sanitizing, fallback customer.

**Upload routes** —
`src/app/api/deliveries/upload-scanned/route.ts`,
`src/app/api/service-invoices/upload-scanned/route.ts`,
`src/app/api/sales-invoices/upload-scanned/route.ts`:
- Build the name from the record's stored date, number and resolved customer
  name instead of `*-SCANNED_{no}_{timestamp}_{original}`.
- Before linking the new file, if the record already had a scanned copy, rename
  that Drive file with the `(replaced YYYY-MM-DD)` suffix; on failure, add a
  warning to the response.
- Sales Invoice route's folder constant changes to `1OvWCCqV…`.

**Script** (`scripts/rename-scanned-copies.mjs`):
- Reads all DRs, Service Invoices and Sales Invoices with a scanned-copy link;
  extracts the Drive file ID from the link.
- For each: compute the target name (keeping the file's current extension);
  for Sales Invoices also the target parent folder.
- Dry run → CSV in the scratch/output path printed at the end; summary counts.
- `--apply` → `files.update` name (and `addParents`/`removeParents` for SI).
- Skips and reports: link isn't a Drive file, file not found, no edit access,
  missing date or number.
- Uses the same OAuth Drive client as uploads (`getDriveUploadClient`), since
  that account owns the existing scans.

## Constraints

- Drive calls run as the OAuth user behind `GOOGLE_REFRESH_TOKEN`, not the
  service account. That user needs edit access to `1OvWCCqV…`; the script's dry
  run checks it can read the target folder and fails fast if not.
- Stored dates must be converted to `MM-DD-YYYY`. If a record has no usable
  date: the upload still succeeds, named with today's date (Manila) and a
  warning saying so; the script skips it and lists it. *(Claude's call.)*

## Left to the builder

- Parsing the stored `DeliveryDate` / `Date` values (ISO `YYYY-MM-DD` expected;
  existing `formatDateMMDDYYYY` helpers in `deliverySheets.ts` and
  `invoiceRepository.ts` show the current handling — the file name uses `-`,
  not `/`).
- Where Service Invoice scanned links live in legacy rows (`scannedFileLink` in
  metadata vs. `driveFileLink` fallback) — the script should use whatever the app
  shows as the Scanned copy.
- Rate limiting / batching of Drive calls for ~470+ DRs.
