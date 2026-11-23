# Golden East DR Form Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Golden East DRs (company `COMP-96`) preview, print and save to Drive on a Golden East–branded form by default, with a switch back to the Aerich form. Any DR can record a "FOR" client, chosen from the companies billed to the DR's company, and both forms print it.

**Architecture:** The FOR client is stored in a new DeliveryReceipts column Y (`ForCompanyId`). It is validated against Companies column I (`BillingCompanyId`) by a pure helper. A second print component (`GoldenEastDeliveryReceiptPrintDocument`) has the same outer shape as `DeliveryReceiptPrintDocument` (`<main className="receipt">` with one `<table>` and `<thead>`), so the paginator in `src/lib/businessDocumentPdf.tsx` works unchanged. The print-form choice is preview state only.

**Tech Stack:** Next.js 16 (read `node_modules/next/dist/docs/` before touching app code), React, TypeScript, Google Sheets API, html2canvas-pro + jsPDF, sharp (already installed).

**Spec:** `docs/superpowers/specs/2026-11-23-golden-east-dr-form-design.md`

## Global Constraints

- Golden East is identified by company id `COMP-96` only, never by name.
- The FOR client must be an existing company whose `billingCompanyId` equals the DR's `companyId`. Blank is always allowed.
- New sheet column: DeliveryReceipts **Y**, header `ForCompanyId`. No other new columns. The print-form choice is not persisted.
- Golden East header text: "GOLDEN EAST" / "RESOURCE TRADING OPC" (correct spelling), next to the logo. Unit Price column is printed and always blank.
- Saving a DR is otherwise unchanged (numbers, stock, Sales Order, contracts). The existing legacy "View previous format" behavior is unchanged.
- Visual reference: PDF export of sheet `1L8I65iPEDuTlY6Vj8bfxqjV4rByzAXxdtha7pjJjJCM`, gid `1973280529`. Colors: dark blue `#2F5496`, light blue `#B4C6E7`, red `#FF0000`.

## Review Focus

- Changing the DR's company in the edit dialog while a FOR client is set: the FOR choice clears, and the server rejects a stale FOR id that's billed to another company. Test in Task 1 (`validateForCompany`) plus a manual check in Task 3.
- A FOR company that was later made inactive or re-pointed to another billing company: existing DRs still print its name. Edits that keep the same FOR id must still save; validation applies only when `forCompanyId` changes. Test in Task 1.
- DRs saved before column Y existed (rows shorter than 25 cells): read as no FOR, print without the FOR line. Covered in Task 2 by reading with `String(row[24] ?? "")`.
- Approval flow: `writeInventoryColumns` writes T:X only and must not blank Y. Checked manually in Task 2 by saving a DR that needs approval, then approving it.
- Many items plus a FOR row: the FOR and filler rows are `<tbody>` rows, so pagination splits them like items. Checked manually in Task 5 with a 30-line DR.

---

### Task 1: Pure helpers (print form, FOR options, FOR validation)

**Files:**
- Create: `src/lib/deliveryPrintForm.ts` (pure, no `@/` imports)
- Create: `scripts/delivery-release-tests/print-form-test.ts`
- Modify: `scripts/delivery-release-tests/tsconfig.json` (add `"../../src/lib/deliveryPrintForm.ts"` to `include`)
- Modify: `scripts/delivery-release-tests/run.ts` (add `import "./print-form-test.ts";`)

**Interfaces:**
- Produces:
  - `export type DeliveryReceiptPrintForm = "golden-east" | "aerich";`
  - `export const GOLDEN_EAST_COMPANY_ID = "COMP-96";`
  - `export function defaultDeliveryReceiptPrintForm(dr: { companyId?: string }): DeliveryReceiptPrintForm` (compares on the trimmed id)
  - `export interface ForCompanyCandidate { companyId: string; companyName: string; status?: string; billingCompanyId?: string }`
  - `export function forCompanyOptions(companies: ForCompanyCandidate[], companyId: string): { value: string; label: string }[]` (active companies with `billingCompanyId === companyId`, sorted by name)
  - `export function validateForCompany(companies: ForCompanyCandidate[], companyId: string, forCompanyId: string | undefined): string | null` (null when blank or valid; otherwise the error `"The FOR client must be a company billed to this DR's company."`). It doesn't check status. Task 2 calls it only when the value changes.

- [ ] **Step 1: Write the failing test**

```ts
const cos = [
  { companyId: "COMP-96", companyName: "GOLDEN EAST RESOURCE TRADING, OPC", status: "active" },
  { companyId: "COMP-122", companyName: "HOLY FAMILY HOSPITAL - PADRE GARCIA", status: "active", billingCompanyId: "COMP-96" },
  { companyId: "COMP-900", companyName: "PRIMELUCK RENAL CARE INC.", status: "active", billingCompanyId: "COMP-96" },
  { companyId: "COMP-901", companyName: "OLD CLINIC", status: "inactive", billingCompanyId: "COMP-96" },
  { companyId: "COMP-115", companyName: "HEMOTEK - CANDON", status: "active", billingCompanyId: "COMP-114" },
];
assert.equal(defaultDeliveryReceiptPrintForm({ companyId: " COMP-96 " }), "golden-east");
assert.equal(defaultDeliveryReceiptPrintForm({ companyId: "COMP-122" }), "aerich");
assert.equal(defaultDeliveryReceiptPrintForm({}), "aerich");
assert.deepEqual(forCompanyOptions(cos, "COMP-96"), [
  { value: "COMP-122", label: "HOLY FAMILY HOSPITAL - PADRE GARCIA" },
  { value: "COMP-900", label: "PRIMELUCK RENAL CARE INC." },
]);
assert.deepEqual(forCompanyOptions(cos, "COMP-24"), []);
assert.equal(validateForCompany(cos, "COMP-96", undefined), null);
assert.equal(validateForCompany(cos, "COMP-96", ""), null);
assert.equal(validateForCompany(cos, "COMP-96", "COMP-122"), null);
assert.equal(validateForCompany(cos, "COMP-96", "COMP-901"), null); // inactive but still billed to it
assert.equal(validateForCompany(cos, "COMP-96", "COMP-115"), "The FOR client must be a company billed to this DR's company.");
assert.equal(validateForCompany(cos, "COMP-96", "COMP-404"), "The FOR client must be a company billed to this DR's company.");
```

- [ ] **Step 2: Run** `npm run test:delivery-releases`. Expected: FAIL, the compiler can't find `deliveryPrintForm.ts`.
- [ ] **Step 3: Implement** the exports above in `src/lib/deliveryPrintForm.ts`. Normalize `status` with `.toLowerCase()`, because the sheet stores "Active".
- [ ] **Step 4: Run** `npm run test:delivery-releases`. Expected: "All delivery-release focused tests passed." and the `.cjs` suites pass.
- [ ] **Step 5: Commit** `feat(deliveries): DR print-form and FOR client helpers`

### Task 2: Store and return the FOR client (column Y) and `companyId`

**Files:**
- Modify: `src/types/deliveryReceipt.ts`: add `forCompanyId?: string` to `CreateDeliveryPayload`. Add `companyId?: string; forCompanyId?: string; forCompanyName?: string` to `DeliveryReceiptResponse`. Add `forCompanyId?: string` to `DeliveryReceiptSummary`.
- Modify: `src/lib/deliverySheets.ts`
- Modify: `src/app/api/deliveries/[id]/route.ts` (GET preview response, around line 108)

**Interfaces:**
- Consumes: `validateForCompany` (Task 1), `getCompanies()` (already used in these files; its rows carry `billingCompanyId`).
- Produces: `DeliveryReceiptResponse.companyId/forCompanyId/forCompanyName` on GET preview and on create. `DeliveryReceiptSummary.forCompanyId` from `getDeliveryReceipts()` and `updateDeliveryReceipt()`.

- [ ] **Step 1: Widen the range and read Y.** `DELIVERY_RECEIPTS_RANGE` becomes `A2:Y`, and the edit-path read at about line 653 becomes `A…:Y…`. The row mapper (about line 204) adds `forCompanyId: String(row[24] ?? "").trim() || undefined`. The GET preview route reads `drRow[24]` the same way and returns `companyId`, `forCompanyId`, and `forCompanyName` (the matching company's `companyName`, else the id).
- [ ] **Step 2: Write Y.** Add `async function writeForCompanyColumn(sheets, spreadsheetId, rowNumber: number, forCompanyId: string)`. It writes `DeliveryReceipts!Y{row}` (RAW) and first makes sure `Y1` is `ForCompanyId`, following `ensureBillingColumn` in `companySheets.ts` (throw if Y1 holds anything else). Call it in `processDeliveryReceipt` right after `writeInventoryColumns` (about line 509). Call it in `updateDeliveryReceipt` only when `payload.forCompanyId !== undefined`. When `payload.companyId` changes and `payload.forCompanyId` is undefined, write `""`.
- [ ] **Step 3: Validate.** In `processDeliveryReceipt`, call `validateForCompany(companies, payload.companyId, payload.forCompanyId)` and throw its message. In `updateDeliveryReceipt`, validate only when the effective FOR id differs from `currentRow[24]` or the company changes. Make sure the POST and PUT routes return these errors as 422, the same as the existing validation errors.
- [ ] **Step 4: Return values from create.** The return at about line 583 adds `companyId: payload.companyId`, `forCompanyId`, and `forCompanyName`.
- [ ] **Step 5: Run** `npx tsc --noEmit -p tsconfig.json` and `npm run test:delivery-releases`. Expected: no new type errors, and the tests pass.
- [ ] **Step 6: Manual check against the dev database.** Get the user's OK first, because this writes to the live sheet. Set COMP-122's Billing company to COMP-96 on the Companies page. Create a draft Golden East DR with FOR = Holy Family, and check that Y holds `COMP-122`. Run one DR through the approval path and check that Y survives. Delete the test DR afterwards.
- [ ] **Step 7: Commit** `feat(deliveries): save FOR client on DRs (column Y)`

### Task 3: FOR dropdown on the DR create form and edit dialog

**Files:**
- Modify: `src/app/dashboard/delivery-releases/page.tsx` (create form state near line 182, payloads at about lines 1116 and 1167, edit dialog state near line 1310 and payload near line 1393)

**Interfaces:**
- Consumes: `forCompanyOptions` (Task 1), the `companies` state (line 149; it must carry `status` and `billingCompanyId`, which `getCompanies()` already maps), and `CreateDeliveryPayload.forCompanyId` (Task 2).

- [ ] **Step 1: Create form.** Add state `forCompanyId` (default `""`). Use the page's existing select component and render a "FOR (client)" field next to the company field, only when `forCompanyOptions(companies, selectedCompany).length > 0`. Options are "None" (`""`) followed by the companies. Clear it whenever `selectedCompany` changes. Send `forCompanyId: forCompanyId || undefined` in both create payloads.
- [ ] **Step 2: Edit dialog.** Add state `editForCompanyId`, initialised from `editTarget.forCompanyId ?? ""`. Show the same field under the same condition, based on the edit dialog's company. Clear it when the company changes. Send `forCompanyId: editForCompanyId` (empty string clears it).
- [ ] **Step 3: Run** `npx tsc --noEmit -p tsconfig.json` and `npx eslint src/app/dashboard/delivery-releases/page.tsx`. Expected: clean.
- [ ] **Step 4: Manual check.** Choosing Golden East shows the FOR field with Holy Family (and Primeluck, once that company exists). A company with nothing billed to it shows no field. Changing company clears the choice. Editing a DR keeps and changes its FOR client.
- [ ] **Step 5: Commit** `feat(deliveries): FOR client dropdown on DR form`

### Task 4: Golden East print component, logo, and FOR line on the Aerich form

**Files:**
- Create: `public/golden-east-logo-print.png`, generated once with
  `node -e "require('sharp')('public/golden-east-logo.png').trim({threshold:20}).toFile('public/golden-east-logo-print.png')"`.
  Commit it together with the user's original `public/golden-east-logo.png`.
- Create: `src/components/golden-east-delivery-receipt-print-document.tsx`
- Modify: `src/components/delivery-receipt-print-document.tsx` (line 25: add `{dr.forCompanyName && <div><b>For:</b> {dr.forCompanyName}</div>}` after the TIN line)

**Interfaces:**
- Consumes: `DeliveryReceiptResponse` fields from Task 2, `printSerialLine` from `@/lib/deliverySerials`, and `UserSignatureImage` / `signerNameKey` / `UserSignatureUrls` as used in `delivery-receipt-print-document.tsx`.
- Produces: `export function GoldenEastDeliveryReceiptPrintDocument({ dr, signatureUrls = {} }: { dr: DeliveryReceiptResponse; signatureUrls?: UserSignatureUrls })`.

Structure required by the paginator in `src/lib/businessDocumentPdf.tsx`: a `<style>` sibling, then `<main className="receipt">` holding exactly one `<table>`. The table's `<thead>` first row is a single cell containing the whole header block. Item, FOR and filler rows go in `<tbody>`. The comments band and signatures are siblings after the table. Prefix every class with `ge-`.

- [ ] **Step 1: Build the header cell.** Left: the logo (`/golden-east-logo-print.png`, height about 60px) with "GOLDEN EAST" / "RESOURCE TRADING OPC" in bold, about 18px, beside it. Right, bordered box: "DELIVERY RECEIPT" in bold, then "NO: " and the DR number in red bold (`DRAFT` when `drNumber <= 0`; add a `DRAFT` line when `status === "draft"`). Then a full-width `#2F5496` bar, about 8px. Then a details grid. Left: **Name:** `companyName`, **Address:** `address`, **TIN:** `tin || "—"`. Right: **Date:** `date`, **PO NO.:** `poNo`, **TR#:** `trNo`.
- [ ] **Step 2: Build the table.** Columns: QTY 10% | UNIT 12% | DESCRIPTION 58% | UNIT PRICE 20%. Header: white bold text on `#2F5496`. Body: the item rows (quantity formatted with `en-PH` and max 6 fraction digits, as on the Aerich form; description plus the `printSerialLine` sub-line; Unit Price empty). Then, when `dr.forCompanyName` is set, a row with `FOR: {forCompanyName}` in red in the description cell. Then blank rows until the body has at least 12 rows. Every cell has thin black borders.
- [ ] **Step 3: Add the blocks after the table.** A `#B4C6E7` band with bold "Comments or Special Instructions". Under it, `dr.comments` with class `multiline`, only when non-empty. Then the signature grid. Left: "Prepared by:" (e-signature, `preparedBy`, "Signature Over Printed Name") and "Delivered by:" (same pattern). Right: "Received the above goods in good order and condition" above a blank line captioned "Signature Over Printed Name".
- [ ] **Step 4: Run** `npx tsc --noEmit -p tsconfig.json` and `npx eslint` on both components. Expected: clean.
- [ ] **Step 5: Commit** `feat(deliveries): Golden East DR print form`

### Task 5: Use the form for PDF and preview, with the switch

**Files:**
- Modify: `src/lib/deliveryReceiptPdf.tsx`
- Modify: `src/components/delivery-receipt-preview-modal.tsx`

**Interfaces:**
- Consumes: `defaultDeliveryReceiptPrintForm` and `DeliveryReceiptPrintForm` (Task 1), `GoldenEastDeliveryReceiptPrintDocument` (Task 4).
- Produces: `generateDeliveryReceiptPdfBase64(dr: DeliveryReceiptResponse, form?: DeliveryReceiptPrintForm): Promise<string>`. When `form` is omitted it uses `defaultDeliveryReceiptPrintForm(dr)`, so the existing callers in `delivery.service.ts` (auto-save on create, the `savePdfToDrive` fallback) need no changes.

- [ ] **Step 1: Update `deliveryReceiptPdf.tsx`.** Render the Golden East component for `"golden-east"`, otherwise the existing one.
- [ ] **Step 2: Update the preview modal.** Add state `form`, initialised from `defaultDeliveryReceiptPrintForm(initialDr ?? {})`. When `!legacy`, render the component for `form`. `handleSaveToDrive` passes `form`. Only when the default is `"golden-east"` and `!legacy`, show an outline button labelled `form === "golden-east" ? "Use Aerich format" : "Use Golden East format"`, disabled while printing or saving, next to "View previous format".
- [ ] **Step 3: Run** `npx tsc --noEmit -p tsconfig.json`, `npx eslint` on both files, and `npm run test:delivery-releases`. Expected: clean, and all tests pass.
- [ ] **Step 4: Manual check** (`npm run dev`):
  1. Preview DR 4086 (Golden East). It shows the Golden East form, and the layout matches the sample export side by side.
  2. "Use Aerich format" switches forms and back. The FOR client shows on both.
  3. A non–Golden East DR (for example 4094) shows only the Aerich form, with no switch button.
  4. Browser print preview (A4) and "Save to Drive" in both forms on a test or draft DR: the PDF matches what's on screen. Don't overwrite a real DR's Drive file without the user's OK.
  5. A draft with about 30 item lines, a FOR client, and multi-line comments: the PDF paginates, the header repeats, and the FOR row and signatures aren't cut off.
- [ ] **Step 5: Commit** `feat(deliveries): Golden East DR form by default with switch to Aerich`

## After the build (data setup, done by the user on the Companies page)

- Holy Family Hospital – Padre Garcia (COMP-122): Billing company → `COMP-96`.
- Create Primeluck Renal Care Inc. with Billing company `COMP-96`.
- B.Braun branches (COMP-362, 363, 364, 366, 371, 374, 375, 379, 380): Billing company → `COMP-24`.
