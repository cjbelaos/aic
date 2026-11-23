# Service Invoice → Accounting Tracker Sync Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Copy every service invoice ≥ 1801 from the app database into the accountants' tracker tab. Writes happen automatically on save, and an admin "Sync to tracker" button catches up anything missed.

**Architecture:**
- A pure projection module turns one invoice into the tracker's A–H/J values and decides whether a row may be written.
- A sheet module reads the tracker and Client Directory once and builds a single `batchUpdate`.
- A sync module wires the two to the app's data and records `trackerSync` in the invoice metadata (ServiceInvoices col T).
- The service-invoice routes call the single-invoice sync from Next's `after()`. An admin route runs the batch.

**Tech Stack:** Next.js 16 route handlers (`after` from `next/server`), googleapis Sheets v4, TypeScript. Tests are CommonJS `scripts/test-*.cjs` harnesses with the `load()` transpile-and-mock pattern from `scripts/test-service-invoice-category.cjs`.

**Spec:** `docs/superpowers/specs/2026-11-23-service-invoice-tracker-sync-design.md`

## Global Constraints

- Tracker: spreadsheet `1izCz-qWLqLhAxOeUtn8qp11iLpdxRn3qnhxumutB43A`, tab sheet ID `449964054`. Overridable via `SERVICE_INVOICE_TRACKER_SPREADSHEET_ID` / `SERVICE_INVOICE_TRACKER_SHEET_ID`.
- Expected tracker header A1:J1, exactly: `Category, Purchase Order No., Date, Invoice No., Customer Name, TIN, Address, Description, Classification, Total Amount`. Any difference → stop, write nothing.
- Scope: numeric invoice numbers **≥ 1801** only. Drafts (`status = draft`, `DRAFT-*`) are never written.
- App-owned tracker columns: A, B, C, E, H, J. D is a key: written only on appended rows. F/G formulas are never overwritten. I and K onward are never written.
- Category values exactly `Contracted` / `Service`. The cancelled marker is exactly `CANCELLED`.
- Client Directory: append only (B = name, F = TIN, G = address). Existing directory rows are never edited. A company TIN/address of `NULL` is written as blank.
- Service invoices only (`invoiceKind "service"`). The sales invoice routes are untouched.
- Read `node_modules/next/dist/docs/01-app/03-api-reference/04-functions/after.md` before Task 4 (AGENTS.md).

## Review Focus

1. **An accountant edits an app-written row** (e.g. corrects H): the next sync must report `needs_review` and not revert it. Covered in Task 1 `isRowWritable` tests.
2. **The same invoice number appears twice in column D**, e.g. a typo copy: that invoice is skipped with `needs_review`, and other invoices still sync. Task 2 test.
3. **The invoice is edited while its earlier auto-sync is still running**, so two syncs run for one number: the second must see the first's `values` as owned and update cleanly, not report `needs_review`. Task 3 test (sequential double sync).
4. **Google Sheets errors during auto-sync**: the invoice save response is unaffected, and the invoice gets `trackerSync.status = "failed"` and shows "Not on tracker". Task 4 test.
5. **The customer name has trailing or double spaces in the app** (e.g. `GRACE DIALYSIS CENTER  SHAW`): the directory match is exact, so the name is appended as-is, and E and the directory entry must be byte-identical. Task 2 test.

---

### Task 1: Pure projection and ownership rules

**Files:**
- Create: `src/lib/serviceInvoiceTracker/projection.ts`
- Test: `scripts/test-service-invoice-tracker.cjs` (new; add `"test:service-invoice-tracker": "node scripts/test-service-invoice-tracker.cjs"` to `package.json`)

**Interfaces:**
- Produces:
  ```ts
  export const TRACKER_FIRST_INVOICE = 1801;
  export type TrackerCell = string | number;
  /** Owned columns in order A,B,C,E,H,J. */
  export interface TrackerProjection { a: string; b: string; c: number | ""; e: string; h: string; j: number | "" }
  export interface ProjectionInput {
    invoiceNo: string; status: string; date: string;           // YYYY-MM-DD
    contractId?: string; poNo?: string; companyName: string;
    items: readonly ServiceInvoiceItem[]; discountAmount?: number;
    salesOrderLines?: readonly { lineNo: number; description: string; lineStatus: string }[]; // present only when SO-linked
  }
  export function isInScope(invoiceNo: string, status: string): boolean;
  export function normalizeInvoiceNo(value: unknown): string;   // strips leading zeros, trims
  export function toDateSerial(isoDate: string): number;        // days since 1899-12-30 UTC
  export function describeInvoice(input: ProjectionInput): string;
  export function projectTrackerRow(input: ProjectionInput): TrackerProjection;
  export function projectionToCells(p: TrackerProjection): TrackerCell[]; // [a,b,c,e,h,j]
  export function isRowWritable(current: readonly unknown[], lastWritten?: readonly TrackerCell[]): boolean; // current = [A,B,C,E,H,J]
  ```

- [ ] **Step 1: Write failing tests** in `scripts/test-service-invoice-tracker.cjs`, loading `projection.ts` via the `load()` helper (`serviceInvoiceDiscounts.ts` and `discounts.ts` load for real):
  - `isInScope("1801","created") === true`; `isInScope("1800","created") === false`; `isInScope("1843","draft") === false`; `isInScope("DRAFT-1792638872160","draft") === false`.
  - `normalizeInvoiceNo("0944") === "944"`; `normalizeInvoiceNo(1801) === "1801"`.
  - `toDateSerial("2026-11-22") === 46348`; `toDateSerial("2026-01-02") === 46024`.
  - SO-linked (SI 1841 shape). `salesOrderLines` = `[{lineNo:1, description:"PRE-TREATMENT REBEDDING…", lineStatus:"INACTIVE"}, {lineNo:3, description:"WATER SOFTENER REBEDDING (16x62)", lineStatus:"ACTIVE"}, {lineNo:2, description:"REPLACEMENT OF DIGITAL HEAD (WATER SOFTENER)", lineStatus:"ACTIVE"}]` → `describeInvoice` returns `"REPLACEMENT OF DIGITAL HEAD (WATER SOFTENER)\nWATER SOFTENER REBEDDING (16x62)"`.
  - No SO (SI 1835 shape). Items `REPAIR OF 5 STATION REPROCESSING A (NEGATIVE)` @4025, `SERVICE CHARGE 2` @0 → `"REPAIR OF 5 STATION REPROCESSING A (NEGATIVE)\nSERVICE CHARGE 2"`.
  - Contract invoice: `contractId:"CTR-0013"`, one item 25000, `poNo:""` → `{a:"Contracted", b:"", c:<serial>, e:<name>, h:"PMS FOR THE MONTH OF NOVEMBER 2026", j:25000}`.
  - Non-contract with PO `"4000251405"`, two items 20000 and 0, discountAmount 500 → `a:"Service"`, `b:"4000251405"`, `j:19500`.
  - Package line (`includedInPackage:true`, unitPrice 0) is listed in H and adds 0 to J.
  - `status:"cancelled"` / `"void"` / `"deleted"` → `a:""`, `b:"CANCELLED"`, `j:""`, with E and H kept.
  - `isRowWritable(["","","","","",""])` → true. `isRowWritable(["Contracted","",46333,"IRENE PEDRO","PMS…",7000])` with no lastWritten → false. Same cells with an equal lastWritten → true. Same cells after someone edited H → false. Numbers compare by value: `46333` equals `"46333"`.
- [ ] **Step 2: Run** `npm run test:service-invoice-tracker`. Expected: FAIL (module missing).
- [ ] **Step 3: Implement `projection.ts`.** J = `invoiceTotals({ items, discountAmount }).grandTotal`. Join H lines with `"\n"`. SO lines are filtered to `lineStatus === "ACTIVE"` and sorted by `lineNo`. "Blank" means `""`, null or undefined.
- [ ] **Step 4: Run** `npm run test:service-invoice-tracker`. Expected: PASS.
- [ ] **Step 5: Commit** `feat(si-tracker): projection and ownership rules`.

### Task 2: Tracker sheet reader and write planner

**Files:**
- Create: `src/lib/serviceInvoiceTracker/sheet.ts`
- Test: extend `scripts/test-service-invoice-tracker.cjs` with a fake `sheets` client (records `batchUpdate` / `values.append` calls)

**Interfaces:**
- Consumes: Task 1 exports.
- Produces:
  ```ts
  export interface TrackerSnapshot {
    spreadsheetId: string; sheetId: number; title: string;     // quoted A1 title
    rows: unknown[][];                                          // A:J, valueRenderOption FORMULA, row 1 = header
    directoryNames: Set<string>;                                // 'Client Directory'!B2:B, exact strings
  }
  export async function readTrackerSnapshot(sheets: sheets_v4.Sheets): Promise<TrackerSnapshot>; // throws "Service Invoice tracker headers changed; sync stopped to protect its data."
  export interface PlannedRow { invoiceNo: string; rowNumber: number; appended: boolean; cells: TrackerCell[] }
  export type PlanOutcome = { kind: "write"; row: PlannedRow; changed: boolean } | { kind: "needs_review"; reason: string };
  export function planRow(snapshot: TrackerSnapshot, invoiceNo: string, projection: TrackerProjection, lastWritten: TrackerCell[] | undefined, nextAppendRow: () => number): PlanOutcome;
  export async function applyTrackerWrites(sheets: sheets_v4.Sheets, snapshot: TrackerSnapshot, rows: PlannedRow[], newCustomers: { name: string; tin: string; address: string }[]): Promise<void>;
  ```

- [ ] **Step 1: Write failing tests:**
  - A header mismatch in the fake (`H1 = "Item"`) → `readTrackerSnapshot` rejects with the exact message above.
  - `planRow` finds the row by `normalizeInvoiceNo(D)`, so the fake row `"1801"` at row 859 → `rowNumber 859, appended false`.
  - Two rows with D `"1805"` → `needs_review`, reason contains `"duplicate"`.
  - No row for `"1844"` → `appended true` at the `nextAppendRow()` value, which is the row after the last non-blank D.
  - An owned cell starting with `"="` → `needs_review`, reason contains `"formula"`.
  - Projection equal to the current cells → `changed false`.
  - `applyTrackerWrites` sends one `spreadsheets.batchUpdate` containing:
    - `updateCells` for A–C and E (C as `numberValue`), H, J only (no I, no K+)
    - for appended rows: D as `stringValue` `"1844"` padded to 4 digits, plus `copyPaste` from row 2 for F:G (`PASTE_NORMAL`), A:J (`PASTE_DATA_VALIDATION`) and A:J (`PASTE_FORMAT`)
    - for an existing row whose F or G is blank (no formula): `copyPaste` F:G from row 2. A non-formula value already in F/G → `needs_review` "manual TIN/address" (proforma rule).
  - For each `newCustomers` entry, one `values.append` to `'Client Directory'!A:G` **before** the batchUpdate, with `["", name, "", "", "", tin, address]`.
  - Review Focus 2: a duplicate on one invoice does not stop the planning of another.
  - Review Focus 5: name `"GRACE DIALYSIS CENTER  SHAW"` (double space) is not in `directoryNames` → appended byte-identical.
- [ ] **Step 2: Run** `npm run test:service-invoice-tracker`. Expected: FAIL.
- [ ] **Step 3: Implement `sheet.ts`.**
  - Resolve the tab by sheet ID from `spreadsheets.get`, as `readProformaSource` does in `src/lib/proforma/tracker.ts:6-17`.
  - Read A1:J{rowCount} with `valueRenderOption: "FORMULA"` and the directory B2:B in one `values.batchGet`.
  - Cell order in `PlannedRow.cells` is `[A,B,C,E,H,J]`.
- [ ] **Step 4: Run** the tests. Expected: PASS.
- [ ] **Step 5: Commit** `feat(si-tracker): tracker snapshot and batched writes`.

### Task 3: Sync orchestration and metadata recording

**Files:**
- Create: `src/lib/serviceInvoiceTracker/sync.ts`
- Modify: `src/types/serviceInvoice.ts` (add `trackerSyncStatus?: "synced" | "failed"` to `InvoiceTrackingFields`)
- Modify: `src/lib/invoiceRepository.ts`, in the `getServiceInvoices` summary mapping (~line 470–540): set `trackerSyncStatus` from `metadata.trackerSync?.status`
- Test: extend `scripts/test-service-invoice-tracker.cjs`

**Interfaces:**
- Consumes: Tasks 1–2. Also `getServiceInvoices()` (`@/lib/serviceInvoiceSheets`), `getCompanies()` (`@/lib/companySheets`, fields `companyId, companyName, tin, address`), `readSalesOrderItemsAll()` (`@/lib/salesOrders/repository`, fields `salesOrderId, lineNo, description, lineStatus`), `getSheetsClient` / `getDatabaseSpreadsheetId` (`@/lib/googleSheets`).
- Produces:
  ```ts
  export interface TrackerSyncMeta { status: "synced" | "failed"; row?: number; syncedAt: string; error?: string; values?: TrackerCell[] }
  export type TrackerSyncOutcome = "added" | "updated" | "unchanged" | "needs_review" | "failed";
  export interface TrackerSyncReport {
    results: { invoiceNo: string; outcome: TrackerSyncOutcome; row?: number; reason?: string }[];
    customersAdded: string[];
  }
  export async function syncServiceInvoicesToTracker(only?: string[]): Promise<TrackerSyncReport>; // all in-scope when omitted
  export async function syncServiceInvoiceToTracker(invoiceNo: string): Promise<void>;           // never throws
  ```

- [ ] **Step 1: Write failing tests** (mock `@/lib/googleSheets`, `@/lib/serviceInvoiceSheets`, `@/lib/companySheets`, `@/lib/salesOrders/repository`):
  - Batch over fixtures 1800 (out of scope, not touched), 1801 (empty placeholder → `added`), 1809 (hand-filled → `needs_review`), 1843 (missing row → `added`, appended) and a draft (ignored).
  - The DB write is one `values.batchUpdate` to `ServiceInvoices!T{row}` per written invoice. It merges `trackerSync: {status:"synced", row, syncedAt, values}` into the existing metadata JSON and keeps the other keys (`billingMode`, `discountData`).
  - A customer missing from the directory → listed in `customersAdded` once, even when two invoices share it.
  - Review Focus 3: calling `syncServiceInvoicesToTracker(["1801"])` twice, the second time after a changed item, → second outcome is `updated`, not `needs_review`. The fake DB keeps the first call's `values`.
  - `applyTrackerWrites` rejects → every planned invoice gets outcome `failed` and `trackerSync.status "failed"` with the error message.
  - `syncServiceInvoiceToTracker` resolves (does not throw) when `readTrackerSnapshot` rejects, and records `failed` for that invoice.
  - `getServiceInvoices` summary exposes `trackerSyncStatus: "failed"` from metadata. Add this to the existing category harness pattern.
- [ ] **Step 2: Run** the tests. Expected: FAIL.
- [ ] **Step 3: Implement `sync.ts`.**
  - Customer name = `companyName` from the invoice summary.
  - SO lines are attached only when `salesOrderId` is set.
  - Re-read col T for the affected rows just before writing, and merge only the `trackerSync` key.
  - `syncServiceInvoiceToTracker` = `syncServiceInvoicesToTracker([invoiceNo])` wrapped in try/catch. Log with `console.error`.
- [ ] **Step 4: Run** the tests. Expected: PASS.
- [ ] **Step 5: Commit** `feat(si-tracker): sync orchestration with ownership metadata`.

### Task 4: Auto-sync on save and admin sync route

**Files:**
- Modify: `src/app/api/service-invoices/route.ts` (POST, after `processServiceInvoice` succeeds)
- Modify: `src/app/api/service-invoices/[invoiceNo]/route.ts` (PUT after `updateServiceInvoice`, DELETE after `deleteServiceInvoice`)
- Modify: `src/app/api/service-invoices/[invoiceNo]/corrected-copy/route.ts` (sync the original and `replacementInvoiceNo`)
- Create: `src/app/api/service-invoices/tracker-sync/route.ts`
- Test: extend `scripts/test-service-invoice-tracker.cjs` (load the route modules with mocked `next/server`, `@/lib/auth/session`, `@/lib/serviceInvoiceTracker/sync`)

**Interfaces:**
- Consumes: `syncServiceInvoiceToTracker`, `syncServiceInvoicesToTracker`, `TrackerSyncReport` (Task 3). Also `requireAuthenticatedSession` and `isAdminUser` (`@/lib/auth/session`) and `after` (`next/server`).
- Produces: `POST /api/service-invoices/tracker-sync` → `200 TrackerSyncReport`; `403 {error:"Admin access required."}` for non-admins; `500 {error}` when the batch throws (header changed).

- [ ] **Step 1: Write failing tests:**
  - POST create with a mocked `after` that captures callbacks → the response is returned, then the captured callback calls `syncServiceInvoiceToTracker(<invoiceNo>)`.
  - A draft create schedules nothing.
  - Corrected copy schedules both numbers.
  - Review Focus 4: a sync mock that rejects does not change the save's status or body.
  - The tracker-sync route returns 403 for a non-admin and 200 with the report for an admin.
- [ ] **Step 2: Run** the tests. Expected: FAIL.
- [ ] **Step 3: Implement.** Call `after(() => syncServiceInvoiceToTracker(no))` only after the repository call resolves, inside the existing try block.
- [ ] **Step 4: Run** `npm run test:service-invoice-tracker && npx tsc --noEmit -p .`. Expected: PASS, no type errors.
- [ ] **Step 5: Commit** `feat(si-tracker): auto-sync after save and admin sync endpoint`.

### Task 5: Register button, summary and "Not on tracker" marker

**Files:**
- Modify: `src/app/dashboard/service-invoices/service-invoices-client.tsx`
  - Toolbar near the admin actions (~line 1764): button `Sync to tracker`, shown only when `isAdmin && invoiceKind === "service"`.
  - Status cell (~line 735–770): marker `Not on tracker` when `row.original.trackerSyncStatus === "failed"`.

**Interfaces:**
- Consumes: `POST /api/service-invoices/tracker-sync` → `TrackerSyncReport` (Task 4); `trackerSyncStatus` on the summary (Task 3).

- [ ] **Step 1: Implement the button.**
  - Disabled with label `Syncing…` while the request runs.
  - On success, open the existing dialog component used elsewhere in this file. Body lines, in order, showing only counts > 0:
    - `{n} added`, `{n} updated`, `{n} unchanged`
    - `{n} customers added to Client Directory: {names}`
    - `{n} need review` (list `SI {no} — {reason}`)
    - `{n} failed` (list `SI {no} — {reason}`)
  - On a non-200, show the response `error` text.
  - Reload the invoice list afterwards so markers clear.
- [ ] **Step 2: Implement the marker**, styled like the existing "Not scanned" badge (line ~763).
- [ ] **Step 3: Verify** with `npx tsc --noEmit -p . && npm run lint -- src/app/dashboard/service-invoices`. Expected: no errors. Run the app (`run` skill). As admin, check the button is visible on Service Invoices and absent on Sales Invoices.
- [ ] **Step 4: Commit** `feat(si-tracker): sync button and not-on-tracker marker`.

### Task 6: One-time 1811 entry and first live run

**Files:**
- Create: `scripts/seed-tracker-spoiled-1811.cjs` (read-only by default, `--apply` writes; auth loaded like `scripts/inspect-si-package.cjs:1-6`)

- [ ] **Step 1: Implement the script.** It finds the tracker row whose `normalizeInvoiceNo(D) === "1811"` and requires exactly one match with A, B, C, E, H, J and V all blank; otherwise it exits non-zero naming the problem. With `--apply` it writes B = `CANCELLED` and V = `Spoiled – wrong document printed on this form.` and nothing else. Without the flag it prints the planned write.
- [ ] **Step 2: Dry run** `node scripts/seed-tracker-spoiled-1811.cjs`. Expected: prints row 869 and the two planned cells.
- [ ] **Step 3: Get Chris's go-ahead, then run** `node scripts/seed-tracker-spoiled-1811.cjs --apply`. Expected: `1811 marked spoiled at row 869.` A rerun exits non-zero with "already filled" and writes nothing.
- [ ] **Step 4: First live sync (with Chris's go-ahead).** Press **Sync to tracker** as admin. Expected report:
  - `needs review`: 1809, 1822, 1838
  - `customers added`: Global Renal Care Specialists Inc., Commonwealth Hospital and Medical Center, Healthway Daniel O Mercado Medical Center - HD2, Green City Medical Center
  - everything else from 1801–1843 `added`
  - Spot-check in the sheet: 1841's H is the two SO lines, 1835's H includes `SERVICE CHARGE 2`, 1803/1818 show `CANCELLED`, and F/G show TIN/address for Green City.
- [ ] **Step 5: Press the button again.** Expected: 0 added, 0 updated, the same 3 need review.
- [ ] **Step 6: Commit** `chore(si-tracker): one-time spoiled 1811 seed script`. Update `docs/service-invoice-tracking.md` with a short "Accounting tracker sync" section (scope ≥1801, owned columns, button, needs-review meaning).
