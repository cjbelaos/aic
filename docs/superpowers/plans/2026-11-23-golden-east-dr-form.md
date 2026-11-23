# Golden East DR Form Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Golden East DRs (company `COMP-96`) preview, print and save to Drive on a Golden East–branded form by default. The preview has a button to switch back to the Aerich form.

**Architecture:** A pure helper decides the default form from `dr.companyId`. A second print component (`GoldenEastDeliveryReceiptPrintDocument`) has the same outer shape as `DeliveryReceiptPrintDocument` (`<main className="receipt">` with one `<table>` and `<thead>`), so the existing paginator in `businessDocumentPdf.tsx` works on it unchanged. `generateDeliveryReceiptPdfBase64` takes an optional form, and the preview modal holds the current choice in state. Nothing is stored in Sheets.

**Tech Stack:** Next.js 16 (read `node_modules/next/dist/docs/` before touching app code), React, TypeScript, html2canvas-pro + jsPDF, sharp (already installed).

**Spec:** `docs/superpowers/specs/2026-11-23-golden-east-dr-form-design.md`

## Global Constraints

- Golden East is identified by company id `COMP-96` only, never by name.
- Header text: "GOLDEN EAST" / "RESOURCE TRADING OPC" (correct spelling), next to the logo.
- Unit Price column is printed but always blank.
- No new Sheets columns. The form choice is not persisted. Each open defaults by company.
- Saving a DR (numbers, stock, Sales Order, contracts) is unchanged.
- The existing "View previous format" (legacy Google Sheets PDF) behavior is unchanged.
- Visual reference: export of the sample sheet `1L8I65iPEDuTlY6Vj8bfxqjV4rByzAXxdtha7pjJjJCM`, gid `1973280529` (tab "AERICH FORMAT"). Colors: dark blue bar/header `#2F5496`, light-blue comments band `#B4C6E7`, red for the number and the FOR line `#FF0000`.

## Review Focus

- Comments that already start with "FOR:" (any case): print once, not "FOR: FOR: …". Test in Task 1.
- Multi-line comments: line breaks are kept on the FOR line. Test in Task 1 (helper returns the text unchanged apart from the prefix). The component uses the `multiline` class.
- Empty or whitespace-only comments: no FOR row at all. Test in Task 1.
- A response without `companyId` (older cached data, contract-releases page): falls back to the Aerich form. Test in Task 1.
- Many items: the FOR row and filler rows are `<tbody>` rows, so the paginator splits them across pages the same way as items. Checked manually in Task 4 with a 30-line DR.

---

### Task 1: Form-choice helpers

**Files:**
- Create: `src/lib/deliveryPrintForm.ts` (pure, no `@/` imports, so the focused tests can compile it)
- Create: `scripts/delivery-release-tests/print-form-test.ts`
- Modify: `scripts/delivery-release-tests/tsconfig.json` (add `"../../src/lib/deliveryPrintForm.ts"` to `include`)
- Modify: `scripts/delivery-release-tests/run.ts` (add `import "./print-form-test.ts";`)

**Interfaces:**
- Produces:
  - `export type DeliveryReceiptPrintForm = "golden-east" | "aerich";`
  - `export const GOLDEN_EAST_COMPANY_ID = "COMP-96";`
  - `export function defaultDeliveryReceiptPrintForm(dr: { companyId?: string }): DeliveryReceiptPrintForm`. Compares on the trimmed id.
  - `export function goldenEastForLine(comments: string | undefined): string | null`. Returns null for empty or whitespace-only input. Otherwise returns `"FOR: " + text`, where any leading `for:` (case-insensitive, optional spaces) is removed from the trimmed text first.

- [ ] **Step 1: Write the failing test** (`print-form-test.ts`, `node:assert/strict`, same style as `reference-test.ts`)

```ts
assert.equal(defaultDeliveryReceiptPrintForm({ companyId: "COMP-96" }), "golden-east");
assert.equal(defaultDeliveryReceiptPrintForm({ companyId: " COMP-96 " }), "golden-east");
assert.equal(defaultDeliveryReceiptPrintForm({ companyId: "COMP-122" }), "aerich");
assert.equal(defaultDeliveryReceiptPrintForm({}), "aerich");
assert.equal(goldenEastForLine(undefined), null);
assert.equal(goldenEastForLine("   "), null);
assert.equal(goldenEastForLine("Holy Family Hospital - Padre Garcia"), "FOR: Holy Family Hospital - Padre Garcia");
assert.equal(goldenEastForLine("FOR: PRIMELUCK RENAL CARE INC."), "FOR: PRIMELUCK RENAL CARE INC.");
assert.equal(goldenEastForLine("for:Primeluck"), "FOR: Primeluck");
assert.equal(goldenEastForLine("Holy Family\nPadre Garcia, Batangas"), "FOR: Holy Family\nPadre Garcia, Batangas");
```

- [ ] **Step 2: Run** `npm run test:delivery-releases`. Expected: FAIL, the compiler can't find `deliveryPrintForm.ts`.
- [ ] **Step 3: Implement** the two functions and constants in `src/lib/deliveryPrintForm.ts`.
- [ ] **Step 4: Run** `npm run test:delivery-releases`. Expected: ends with "All delivery-release focused tests passed." and the two `.cjs` suites pass.
- [ ] **Step 5: Commit** `feat(deliveries): Golden East DR form-choice helpers`

### Task 2: Return `companyId` with every DR response

**Files:**
- Modify: `src/types/deliveryReceipt.ts`: add `companyId?: string;` to `DeliveryReceiptResponse`
- Modify: `src/app/api/deliveries/[id]/route.ts` (preview response, around line 108): add `companyId`
- Modify: `src/lib/deliverySheets.ts` (create return, around line 583): add `companyId: payload.companyId`

**Interfaces:**
- Produces: `DeliveryReceiptResponse.companyId`, filled for previews and newly created DRs.

- [ ] **Step 1: Add the field and the two assignments.**
- [ ] **Step 2: Run** `npx tsc --noEmit -p tsconfig.json`. Expected: no new errors in these files (compare against `git stash` output if the baseline already has errors).
- [ ] **Step 3: Commit** `feat(deliveries): include companyId in DR responses`

### Task 3: Golden East print component and logo

**Files:**
- Create: `public/golden-east-logo-print.png`. Generate it once with
  `node -e "require('sharp')('public/golden-east-logo.png').trim({threshold:20}).toFile('public/golden-east-logo-print.png')"`
  and commit it together with the user's original `public/golden-east-logo.png`.
- Create: `src/components/golden-east-delivery-receipt-print-document.tsx`

**Interfaces:**
- Consumes: `goldenEastForLine` (Task 1), `DeliveryReceiptResponse.companyId` (Task 2), `printSerialLine` from `@/lib/deliverySerials`, `UserSignatureImage` / `signerNameKey` / `UserSignatureUrls` as used in `delivery-receipt-print-document.tsx`.
- Produces: `export function GoldenEastDeliveryReceiptPrintDocument({ dr, signatureUrls = {} }: { dr: DeliveryReceiptResponse; signatureUrls?: UserSignatureUrls })`, the same props as `DeliveryReceiptPrintDocument`.

Structure (required by the paginator in `src/lib/businessDocumentPdf.tsx`): a `<style>` sibling, then `<main className="receipt ge">` that holds exactly one `<table>` whose `<thead>` first row has a single cell containing the whole header block. Item, FOR and filler rows go in `<tbody>`. The comments band and signatures are siblings after the table. Prefix every class with `ge-` so nothing clashes with the shared shell styles.

- [ ] **Step 1: Build the header cell.** Left: the logo image (`/golden-east-logo-print.png`, height about 60px) with "GOLDEN EAST" / "RESOURCE TRADING OPC" in bold, about 18px, beside it. Right box, bordered: "DELIVERY RECEIPT" in bold, about 18px, and below it "NO: " followed by the DR number in red bold (`DRAFT` when `dr.drNumber <= 0`; add a `DRAFT` line when `status === "draft"`, as the Aerich form does). Then a full-width blue bar (`#2F5496`, about 8px). Then a two-column details grid. Left: **Name:** `companyName`, **Address:** `address`, **TIN:** `tin || "—"`. Right: **Date:** `date`, **PO NO.:** `poNo`, **TR#:** `trNo`.
- [ ] **Step 2: Build the table.** Columns: QTY 10% | UNIT 12% | DESCRIPTION 58% | UNIT PRICE 20%. Header row: white bold text on `#2F5496`. Body: one row per item (quantity formatted like the Aerich form, `en-PH`, max 6 fraction digits; description plus the `printSerialLine` sub-line; UNIT PRICE empty). Then, if `goldenEastForLine(dr.comments)` isn't null, one row with that text in red in the DESCRIPTION cell, class `multiline`. Then empty filler rows until the body has at least 12 rows. Every cell has a thin black border, so the grid matches the sample.
- [ ] **Step 3: Add the blocks after the table.** A light-blue band (`#B4C6E7`) with bold "Comments or Special Instructions". A signature grid with "Prepared by:" (e-signature, `preparedBy`, "Signature Over Printed Name") and "Delivered by:" (e-signature, `deliveredBy`, same caption) on the left. On the right, "Received the above goods in good order and condition" above a blank line captioned "Signature Over Printed Name".
- [ ] **Step 4: Run** `npx tsc --noEmit -p tsconfig.json` and `npx eslint src/components/golden-east-delivery-receipt-print-document.tsx`. Expected: clean.
- [ ] **Step 5: Commit** `feat(deliveries): Golden East DR print form`

### Task 4: Use the form for PDF and preview, with the switch

**Files:**
- Modify: `src/lib/deliveryReceiptPdf.tsx`
- Modify: `src/components/delivery-receipt-preview-modal.tsx`

**Interfaces:**
- Consumes: `defaultDeliveryReceiptPrintForm`, `DeliveryReceiptPrintForm` (Task 1), `GoldenEastDeliveryReceiptPrintDocument` (Task 3).
- Produces: `generateDeliveryReceiptPdfBase64(dr: DeliveryReceiptResponse, form?: DeliveryReceiptPrintForm): Promise<string>`. When `form` is omitted it uses `defaultDeliveryReceiptPrintForm(dr)`, so the existing callers in `delivery.service.ts` (auto-save on create, `savePdfToDrive` fallback) pick the Golden East form for `COMP-96` without changes.

- [ ] **Step 1: Update `deliveryReceiptPdf.tsx`.** Render `GoldenEastDeliveryReceiptPrintDocument` when the resolved form is `"golden-east"`, otherwise `DeliveryReceiptPrintDocument`.
- [ ] **Step 2: Update the preview modal.** Add state `form`, initialised from `defaultDeliveryReceiptPrintForm(initialDr ?? {})`. When `!legacy`, render the component for `form` inside `BusinessDocumentPrintFrame`. Pass `form` to `generateDeliveryReceiptPdfBase64(latest, form)` in `handleSaveToDrive`. Only when `defaultDeliveryReceiptPrintForm(dr) === "golden-east"` and `!legacy`, show an outline button next to "View previous format" with the label `form === "golden-east" ? "Use Aerich format" : "Use Golden East format"`. It is disabled while printing or saving, like the existing button.
- [ ] **Step 3: Run** `npx tsc --noEmit -p tsconfig.json`, `npx eslint src/lib/deliveryReceiptPdf.tsx src/components/delivery-receipt-preview-modal.tsx` and `npm run test:delivery-releases`. Expected: clean, and all tests pass.
- [ ] **Step 4: Manual check in the running app** (`npm run dev`; use the `run` skill if it helps):
  1. Open the preview for DR 4086 (Golden East). It shows the Golden East form, and the layout matches the sample export side by side.
  2. Click "Use Aerich format". It shows the normal form. Click back.
  3. Open a non–Golden East DR, for example 4094. Only the Aerich form shows, with no switch button.
  4. On a Golden East DR, use the browser print preview (A4) and "Save to Drive" in both forms. The PDF matches what's on screen. Don't overwrite a real DR's Drive file without the user's OK; use a draft or a test DR.
  5. A Golden East draft with about 30 item lines plus multi-line comments: the PDF paginates, the header repeats, and the FOR row and signatures aren't cut off.
- [ ] **Step 5: Commit** `feat(deliveries): Golden East DR form by default with switch to Aerich`
