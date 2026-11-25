# Bulk Scanned Service Invoice Upload Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Split a multi-page scanned PDF of Service Invoices in the browser, read each page's red invoice number, review the pages on a check screen, and attach each one as that invoice's scanned copy.

**Architecture:** A pure rules module (number parsing, red-ink mask, row status) that can be tested in Node. A browser PDF module (pdfjs render, tesseract read, pdf-lib split) that is lazy-loaded. A dialog component wired into the Service Invoices page only. Saving reuses the existing `serviceInvoiceService.uploadScanned` → `POST /api/service-invoices/upload-scanned`. That route's only change is its Drive folder.

**Tech Stack:** Next.js 16 / React 19 client component, `pdfjs-dist`, `pdf-lib`, `tesseract.js`, existing shadcn `Dialog`, Node `assert` test scripts in the repo's `.cjs` transpile-and-load style.

**Spec:** `docs/superpowers/specs/2026-11-25-bulk-scanned-si-upload-design.md`

## Global Constraints

- New Service Invoice scan folder: `1bUpm-7ExZzgBvcmqBNd24iw6n3q_R1IM`. Sales Invoice route keeps `166LGOl4qTL4Ukabnrk335OT0ccLQnCq_`.
- Bulk button appears only when `!isSales`. Label: "Bulk upload scans".
- Number crop: x 77–95%, y 7–16% of the page. Red pixel: `r > 150 && g < 120 && b < 120`. Tesseract digits-only whitelist. Result = longest 3–6 digit run.
- Per-page PDFs copy the original page with `pdf-lib`; they are not re-rendered. Uploaded file name: `SI <number>.pdf`.
- Nothing is saved without the check screen. A new scan replaces the existing one. Old Drive files are never deleted.
- Heavy libraries load via dynamic `import()` only when the dialog processes a file.
- Read the relevant guide in `node_modules/next/dist/docs/` before writing client-component code (AGENTS.md).
- Work on branch `feat/bulk-scanned-si-upload`.

## Review Focus

1. A page scanned upside down, or a blank back side: the number reads as unread, and the user can type it or Skip. Covered by `rowStatus` "unread" in Task 1. Manual check in Task 4.
2. OCR picks up extra digits (e.g. "11599" from the "Nº" mark) → "not_found" blocks saving instead of attaching to a wrong invoice. Covered by the Task 1 test.
3. Closing the dialog while uploads are running: the close button and Escape are disabled while saving, so no upload is half-tracked. Task 3.
4. A 20+ page batch: pages render and OCR one at a time with a progress label, and a single Tesseract worker is reused, so the tab doesn't freeze or run out of memory. Task 2.
5. One page's upload fails (network or 500): that row shows the error with Retry, the other rows still save, and the list refreshes. Task 3.

---

### Task 1: Rules module, folder switch, tests

**Files:**
- Create: `src/lib/scannedInvoiceBatch.ts`
- Create: `scripts/test-scanned-invoice-batch.cjs`
- Modify: `src/app/api/service-invoices/upload-scanned/route.ts:11` (folder id)
- Modify: `package.json` (add `"test:scanned-invoice-batch": "node scripts/test-scanned-invoice-batch.cjs"`)

**Interfaces — Produces:**
```ts
export const NUMBER_CROP = { x0: 0.77, y0: 0.07, x1: 0.95, y1: 0.16 } as const;
export function isRedInk(r: number, g: number, b: number): boolean;
/** RGBA in → RGBA out: red pixels black, everything else white. */
export function redInkMask(data: Uint8ClampedArray): Uint8ClampedArray;
export function pickInvoiceNumber(ocrText: string): string | null;
export type BatchRowStatus = "match" | "replaces_scan" | "inactive" | "not_found" | "unread" | "duplicate" | "skipped";
export interface BatchInvoiceInfo { invoiceNo: string; companyName: string; total: number; status: string; hasScan: boolean }
export function rowStatus(invoiceNo: string, skipped: boolean, invoice: BatchInvoiceInfo | undefined, duplicate: boolean): BatchRowStatus;
export function blocksSave(status: BatchRowStatus): boolean; // true for not_found | unread | duplicate
export function duplicateNumbers(numbers: string[]): Set<string>; // ignores ""
```
Status precedence: skipped → unread (empty) → duplicate → not_found → inactive (status `cancelled`/`void`) → replaces_scan → match.

- [ ] **Step 1: Create branch** `git checkout -b feat/bulk-scanned-si-upload`
- [ ] **Step 2: Write failing test** `scripts/test-scanned-invoice-batch.cjs` using the `load()` transpile helper from `scripts/test-service-invoice-tracking.cjs`. Assertions:
  - `isRedInk(200,50,50)` true; `isRedInk(140,50,50)` false; `isRedInk(200,130,50)` false
  - `redInkMask(Uint8ClampedArray.from([200,50,50,255, 20,20,20,255]))` deep-equals `[0,0,0,255, 255,255,255,255]`
  - `pickInvoiceNumber("1599\n")` = `"1599"`; `pickInvoiceNumber("N 12 1816 x")` = `"1816"`; `pickInvoiceNumber("")` = `null`; `pickInvoiceNumber("12")` = `null`
  - `rowStatus("", false, undefined, false)` = `"unread"`; `rowStatus("9999", false, undefined, false)` = `"not_found"`; with info `{status:"created",hasScan:false}` → `"match"`; `hasScan:true` → `"replaces_scan"`; `status:"void"` → `"inactive"`; duplicate=true → `"duplicate"`; skipped=true with anything → `"skipped"`
  - `blocksSave` true only for `not_found`, `unread`, `duplicate`
  - `[...duplicateNumbers(["1816","1815","1816",""])]` = `["1816"]`
  - Route source contains `1bUpm-7ExZzgBvcmqBNd24iw6n3q_R1IM`; sales route source still contains `166LGOl4qTL4Ukabnrk335OT0ccLQnCq_`
- [ ] **Step 3: Run** `node scripts/test-scanned-invoice-batch.cjs` → FAIL (module missing)
- [ ] **Step 4: Implement** `src/lib/scannedInvoiceBatch.ts` (no imports, so it's Node-safe) and change the folder constant in the service route.
- [ ] **Step 5: Run** `npm run test:scanned-invoice-batch` → exits 0
- [ ] **Step 6: Commit** `feat(service-invoices): batch scan rules and new scan folder`

### Task 2: Browser PDF processing + sample verification

**Files:**
- Create: `src/lib/scannedInvoiceBatchPdf.ts`
- Create: `scripts/verify-scanned-batch-sample.mjs` (manual check, not in CI)
- Modify: `package.json` (deps `pdfjs-dist`, `pdf-lib`, `tesseract.js`)

**Interfaces — Consumes:** `NUMBER_CROP`, `redInkMask`, `pickInvoiceNumber` (Task 1).
**Produces:**
```ts
export interface ScannedPage { pageIndex: number; thumbnailUrl: string; detectedNo: string | null }
/** Renders and reads pages one at a time; onProgress(done, total). */
export async function analyzeScannedPdf(file: File, onProgress?: (done: number, total: number) => void): Promise<{ pages: ScannedPage[]; dispose: () => void }>;
export async function extractPagePdf(file: File, pageIndex: number, invoiceNo: string): Promise<File>; // application/pdf, name `SI ${invoiceNo}.pdf`
```
- Render each page with pdfjs at scale ≈ 2 (≈150 dpi) on an offscreen canvas. Thumbnail = JPEG data/object URL at about 240 px wide. Crop `NUMBER_CROP`, apply `redInkMask`, upscale ×2, and OCR with one reused `tesseract.js` worker (`tessedit_char_whitelist: "0123456789"`, `tessedit_pageseg_mode: "6"`). `dispose()` terminates the worker and revokes the URLs.
- Configure the pdfjs worker per the installed version (`GlobalWorkerOptions.workerSrc = new URL("pdfjs-dist/build/pdf.worker.min.mjs", import.meta.url)`).

- [ ] **Step 1: Install** `npm i pdfjs-dist pdf-lib tesseract.js`
- [ ] **Step 2: Write** `scripts/verify-scanned-batch-sample.mjs`. It renders the sample in Node (pdfjs legacy build + its `@napi-rs/canvas` peer), runs the same crop / `redInkMask` / OCR pipeline, and prints one number per page. Expected, in order: `1599 1816 1815 1813 1814 1750 1819 1659 1817`. Input path: `C:\Users\chris\OneDrive\Documents\Scan2026-11-25_102818.pdf`.
- [ ] **Step 3: Run it.** At least 7/9 correct passes, because the check screen covers the rest. If fewer than 7 are correct, tune the threshold or crop, update the Task 1 constants and tests together, and record the final numbers.
- [ ] **Step 4: Implement** `src/lib/scannedInvoiceBatchPdf.ts` with the same pipeline in browser form.
- [ ] **Step 5: Run** `npx tsc --noEmit` → no new errors
- [ ] **Step 6: Commit** `feat(service-invoices): split and read scanned invoice batches in the browser`

### Task 3: Check-screen dialog wired into the page

**Files:**
- Create: `src/components/bulk-scan-upload-dialog.tsx`
- Modify: `src/app/dashboard/service-invoices/service-invoices-client.tsx` (header `actions` near line 2011; state near line 329)

**Interfaces — Consumes:** Task 1 rules; Task 2 `analyzeScannedPdf` / `extractPagePdf` (via `await import("@/lib/scannedInvoiceBatchPdf")`); `serviceInvoiceService.uploadScanned(invoiceNo, file)`; `invoiceTotals(invoice).grandTotal` from `@/lib/serviceInvoiceDiscounts`.
**Produces:**
```ts
export function BulkScanUploadDialog(props: {
  open: boolean; onOpenChange: (open: boolean) => void;
  invoices: ServiceInvoiceSummary[];
  upload: (invoiceNo: string, file: File) => Promise<{ fileLink: string }>;
  onSaved: () => void;
}): JSX.Element;
```
- Steps inside the dialog: choose a PDF (accepts `application/pdf` only) → "Reading page n of N…" → table.
- Table columns: Page · Thumbnail (click to enlarge) · Invoice No. input · System (companyName · ₱total · status) · Status badge · Skip checkbox.
- `hasScan` = `scannedStatus === "scanned"`.
- **Save all** is disabled while any non-skipped row `blocksSave`, or when there are zero rows to save. It uploads sequentially, and each row shows Saving / Saved / Failed + Retry. Close and Escape are disabled while saving. When done, a toast shows "N scans saved, M failed", then `onSaved()` (the page calls `fetchList()`).
- Page: a `Button variant="outline"` "Bulk upload scans" (lucide `FileStack` icon) before Create New, rendered only when `!isSales`.
- Scanned copy column (around line 756): when `scannedStatus === "scanned"` and `scannedFileLink` is set, the "Scanned" badge is an `<a href={scannedFileLink} target="_blank" rel="noopener noreferrer">` with a small `ExternalLink` icon and the title "Open scanned copy". It uses `scannedFileLink` only, never `driveFileLink`. "Not scanned" stays plain. This applies to both pages (Sales and Service).

- [ ] **Step 1: Implement** the dialog and the wiring.
- [ ] **Step 2: Run** `npx tsc --noEmit` and `npx eslint src/components/bulk-scan-upload-dialog.tsx src/app/dashboard/service-invoices/service-invoices-client.tsx` → clean
- [ ] **Step 3: Run** `npm run test:scanned-invoice-batch && npm run test:sales-invoices` → pass
- [ ] **Step 4: Commit** `feat(service-invoices): bulk scanned copy upload with check screen`

### Task 4: Real-browser verification

- [ ] **Step 1:** `npm run dev`, open `/dashboard/service-invoices`, and open the dialog with the sample PDF. Confirm there are 9 rows, the thumbnails match their pages, and the numbers match the expected list (corrected by hand where OCR missed). Confirm the System column shows the right customers (for example 1750 → Angeles University Foundation Medical Center, ₱1,100.00).
- [ ] **Step 2:** Confirm `/dashboard/sales-invoices` has no bulk button.
- [ ] **Step 3:** **Stop and ask Chris** before clicking Save all. It writes to the live sheet and Drive. With his OK: save, then confirm the files land in folder `1bUpm…` named `SI-SCANNED_<no>_…_SI_<no>.pdf`, each row shows "Scanned", and an opened scan shows the right page.
- [ ] **Step 4:** Update `C:\Users\chris\KOS\02 - Projects\Active\AIC\handoff.md` with the outcome.
