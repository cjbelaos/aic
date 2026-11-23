# No-charge Delivery Receipts Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let staff create a DR with a third reference type, **No charge** (reason Warranty / Gift / Sample / Other), that never counts against contracts and can never be billed.

**Architecture:** Extend the pure reference module (`src/lib/deliveryReference.ts`) with a `NO_CHARGE` mode and reason; persist reason/note in new DeliveryReceipts columns Z/AA; the API, form, print and invoice paths read the mode through that module.

**Tech Stack:** Next.js (read `node_modules/next/dist/docs/` before touching route/page conventions), TypeScript, Google Sheets API, node:assert focused tests.

**Spec:** `docs/superpowers/specs/2026-11-23-no-charge-dr-design.md`

## Global Constraints

- Mode value `NO_CHARGE`; reasons `WARRANTY | GIFT | SAMPLE | OTHER`, labels `Warranty`, `Gift`, `Sample`, `Other`.
- Choice label `No charge`, description `Warranty, gift or sample. No Sales Order or TR Number.`
- OTHER requires a non-blank (trimmed) note; other reasons allow an optional note.
- Storage: DeliveryReceipts **Z = NoChargeReason**, **AA = NoChargeNote** (0-based indexes 25, 26). Y stays ForCompanyId. Column E and S are empty on a no-charge DR.
- Displayed reference for a no-charge DR is the reason label uppercased (`WARRANTY`, `GIFT`, `SAMPLE`, `OTHER`); kind label `No charge`.
- No-charge DRs: never send or accept `contractLines`; never linkable to Service or Sales Invoices.
- Payloads without `referenceMode` keep today's behaviour exactly and leave Z/AA untouched.
- Work on branch `feat/no-charge-dr`; commit messages end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Review Focus

1. Switching an existing SO or TR DR to No charge on edit clears E and S; switching back clears Z and AA. (Task 1 row-values test; Task 2 writes.)
2. A DR that already released contract items cannot be switched to No charge → error `This DR released contract items, so it can't be marked No charge.` (Task 2.)
3. OTHER with a whitespace-only note is rejected. (Task 1 test.)
4. Historical rows shorter than column Z parse exactly as before. (Task 1 test.)
5. A no-charge DR number sent straight to the invoice API is rejected with `A no-charge DR can't be billed.` (Task 4.)

---

### Task 0: Branch and commit the spec

- [ ] **Step 1:** `git checkout -b feat/no-charge-dr`
- [ ] **Step 2:** Commit the spec and this plan:

```bash
git add docs/superpowers/specs/2026-11-23-no-charge-dr-design.md docs/superpowers/plans/2026-11-23-no-charge-dr.md
git commit -m "docs: no-charge DR design and plan"
```

---

### Task 1: NO_CHARGE mode in the reference module

**Files:**
- Modify: `src/lib/deliveryReference.ts`
- Test: `scripts/delivery-release-tests/reference-test.ts`

**Interfaces — Produces:**
- `type DeliveryReferenceMode = "SALES_ORDER" | "TR_NUMBER" | "NO_CHARGE"`; `DELIVERY_REFERENCE_MODES` and `DELIVERY_REFERENCE_MODE_CHOICES` gain the third entry (label/description per Global Constraints).
- `type NoChargeReason = "WARRANTY" | "GIFT" | "SAMPLE" | "OTHER"`
- `NO_CHARGE_REASONS: readonly { value: NoChargeReason; label: string }[]`
- `isNoChargeReason(value: unknown): value is NoChargeReason`
- `noChargeReasonDisplay(reason: string | null | undefined): string` → uppercased label, `""` if not a reason.
- `isNoChargeDelivery(record: { noChargeReason?: string | null }): boolean`
- `DELIVERY_REFERENCE_CHOOSE_REASON_ERROR = "Choose a no-charge reason."`
- `DELIVERY_REFERENCE_OTHER_NOTE_ERROR = "Add a note explaining the Other reason."`
- `DELIVERY_NO_CHARGE_REASON_COLUMN = 25`, `DELIVERY_NO_CHARGE_NOTE_COLUMN = 26`
- `DeliveryReferenceInput` gains `noChargeReason?: string | null; noChargeNote?: string | null`.
- `DeliveryReferenceResolution` and `DeliveryReferenceRecord` gain `noChargeReason: NoChargeReason | ""; noChargeNote: string`.
- `DeliveryReferenceRowValues` gains `noChargeReason?: string; noChargeNote?: string` — **present** (possibly `""`) whenever a mode was sent, **absent** when no mode (caller leaves Z/AA untouched).
- `referenceModeForRecord`, `deliveryReferenceDisplay`, `deliveryReferenceKindLabel` accept an optional `noChargeReason` on the record.

- [ ] **Step 1: Write failing tests** (append to `reference-test.ts`; update the existing mode-choices assertion to the three values)

```ts
assert.deepEqual(DELIVERY_REFERENCE_MODE_CHOICES.map((c) => c.value), ["SALES_ORDER", "TR_NUMBER", "NO_CHARGE"]);
assert.deepEqual(NO_CHARGE_REASONS.map((r) => r.value), ["WARRANTY", "GIFT", "SAMPLE", "OTHER"]);
assert.equal(DELIVERY_NO_CHARGE_REASON_COLUMN, 25);
assert.equal(DELIVERY_NO_CHARGE_NOTE_COLUMN, 26);

// No charge: reason required, clears SO link and TR number.
assert.equal(resolveDeliveryReference({ referenceMode: "NO_CHARGE" }).error, DELIVERY_REFERENCE_CHOOSE_REASON_ERROR);
assert.deepEqual(
  deliveryReferenceRowValues({ referenceMode: "NO_CHARGE", noChargeReason: "WARRANTY", salesOrderId: "so-1", trNo: "TR-1", noChargeNote: "  unit swap " }),
  { reference: "", salesOrderId: "", noChargeReason: "WARRANTY", noChargeNote: "unit swap" },
);
// OTHER needs a non-blank note.
assert.equal(resolveDeliveryReference({ referenceMode: "NO_CHARGE", noChargeReason: "OTHER", noChargeNote: "   " }).error, DELIVERY_REFERENCE_OTHER_NOTE_ERROR);
assert.equal(resolveDeliveryReference({ referenceMode: "NO_CHARGE", noChargeReason: "OTHER", noChargeNote: "demo unit" }).error, undefined);
// Explicit SO / TR modes clear the no-charge columns.
assert.deepEqual(deliveryReferenceRowValues({ referenceMode: "TR_NUMBER", trNo: "TR-9" }), { reference: "TR-9", salesOrderId: "", noChargeReason: "", noChargeNote: "" });
// No mode: no-charge keys absent (Z/AA untouched).
assert.equal("noChargeReason" in deliveryReferenceRowValues({ trNo: "TR-9" }), false);

// Row parsing.
const ncRow = receiptRow("", "");
ncRow[DELIVERY_NO_CHARGE_REASON_COLUMN] = "GIFT";
const ncRef = deliveryReferenceFromRow(ncRow);
assert.equal(ncRef.referenceMode, "NO_CHARGE");
assert.equal(ncRef.noChargeReason, "GIFT");
assert.equal(deliveryReferenceDisplay(ncRef), "GIFT");
assert.equal(deliveryReferenceKindLabel(ncRef), "No charge");
assert.equal(referenceModeForRecord(ncRef), "NO_CHARGE");
assert.equal(isNoChargeDelivery(ncRef), true);
// Short historical row (ends at S) parses as before.
const oldRef = deliveryReferenceFromRow(receiptRow("TR-1", ""));
assert.equal(oldRef.referenceMode, "TR_NUMBER");
assert.equal(oldRef.noChargeReason, "");
assert.equal(isNoChargeDelivery(oldRef), false);
```

- [ ] **Step 2:** Run `npm run test:delivery-releases` → FAIL (missing exports / tsc errors).
- [ ] **Step 3:** Implement the interfaces above in `deliveryReference.ts`. An unknown string in column Z is treated as no reason. Update the file's header comment to describe three modes.
- [ ] **Step 4:** Run `npm run test:delivery-releases` → `All delivery-release focused tests passed.`
- [ ] **Step 5:** Commit `feat(deliveries): no-charge reference mode`.

---

### Task 2: Persist and print the no-charge reason

**Files:**
- Modify: `src/types/deliveryReceipt.ts` (`CreateDeliveryPayload`, `UpdateDeliveryPayload`, `DeliveryReceiptResponse`, `DeliveryReceiptSummary`)
- Modify: `src/lib/deliverySheets.ts`
- Modify: `scripts/setup-inventory-sheets.mjs`
- Modify: `src/components/delivery-receipt-print-document.tsx`

**Interfaces:**
- Consumes: Task 1 exports.
- Produces: payload/response/summary fields `referenceMode?: DeliveryReferenceMode`, `noChargeReason?: string`, `noChargeNote?: string`. Summary rows from `getDeliveryReceipts()` carry `noChargeReason`/`noChargeNote` (`undefined` when blank). `resolveDeliveryReceiptReferences()` return type gains `noChargeReason?: string`.

- [ ] **Step 1:** Types: import `DeliveryReferenceMode` instead of the inline union; add the fields above.
- [ ] **Step 2:** `deliverySheets.ts`:
  - `DELIVERY_RECEIPTS_RANGE` → `A2:AA`; update the column comment (Z NoChargeReason, AA NoChargeNote).
  - Add `writeNoChargeColumns(sheets, spreadsheetId, rowNumber, reason: string, note: string)` writing `Z{row}:AA{row}` RAW, same shape as `writeForCompanyColumn`.
  - Create path (~L479–540): when `referenceRow.noChargeReason !== undefined` and non-empty, call `writeNoChargeColumns` after the row exists.
  - Update path (~L681–819): read range `A:AA`; when `referenceRow.noChargeReason !== undefined`, write Z/AA (writes `""` to clear when switching to SO/TR).
  - Update path: if the resolved mode is `NO_CHARGE`, the stored row has no reason, and `getContractReleases()` has any release for this `drNumber`, throw `Error("This DR released contract items, so it can't be marked No charge.")`. Reuse the existing dynamic import at ~L698.
  - `getDeliveryReceipts()` row map: add `noChargeReason`/`noChargeNote` from indexes 25/26; set `trNo` to `deliveryReferenceDisplay(reference)` so lists get `WARRANTY`.
  - Legacy print template F11 (~L572 and ~L1044): use the reason display when the DR is no-charge.
  - `resolveDeliveryReceiptReferences()` (~L253): read through `AA` and return `noChargeReason`.
  - Response objects (~L612, ~L854): include `noChargeReason`, `noChargeNote`.
- [ ] **Step 3:** `setup-inventory-sheets.mjs`: add `["DeliveryReceipts!Z1", "NoChargeReason"]`, `["DeliveryReceipts!AA1", "NoChargeNote"]`.
- [ ] **Step 4:** Print document L37: `SO / TR No.` shows `dr.trNo || noChargeReasonDisplay(dr.noChargeReason) || "—"`.
- [ ] **Step 5:** Run `npx tsc --noEmit` → no errors; `npm run test:delivery-releases` → pass.
- [ ] **Step 6:** Commit `feat(deliveries): store and print no-charge reason (Z/AA)`.

> Before shipping: run `node scripts/setup-inventory-sheets.mjs` against the live sheet so Z1/AA1 headers exist (ask the user first — it writes to production).

---

### Task 3: API validation and DR form

**Files:**
- Modify: `src/app/api/deliveries/route.ts` (~L73–85, ~L158)
- Modify: `src/app/api/deliveries/[id]/route.ts` (~L172–184)
- Modify: `src/components/delivery-release-reference-field.tsx`
- Modify: `src/app/dashboard/delivery-releases/page.tsx`
- Modify: `src/components/delivery-receipt-preview-modal.tsx` (~L149)

**Interfaces — Consumes:** Task 1 (`resolveDeliveryReference`, `NO_CHARGE_REASONS`, `isNoChargeDelivery`), Task 2 payload fields.

- [ ] **Step 1: API.** Pass `noChargeReason`/`noChargeNote` into `resolveDeliveryReference` in both routes; when a mode was sent, copy the resolved `noChargeReason`/`noChargeNote` back onto `body`. In `POST`, if mode is `NO_CHARGE` and `body.contractLines?.length`, return 422 `A no-charge DR can't release contract items.`
- [ ] **Step 2: Reference field.** Props gain `noChargeReason: string`, `onNoChargeReasonChange(v: string)`, `noChargeNote: string`, `onNoChargeNoteChange(v: string)`. Grid becomes `sm:grid-cols-3`. In `NO_CHARGE` mode render a Reason select (from `NO_CHARGE_REASONS`) and a Note input labelled `Note` (`Note (required)` when OTHER). Leave `InvoiceReferenceTypeSelector` showing only the two invoice choices (filter out `NO_CHARGE`). Update the empty-state copy to `Choose a reference type to continue.`
- [ ] **Step 3: Page state.** Add `noChargeReason`/`noChargeNote` and edit equivalents. `changeReferenceMode` clears reason/note when leaving NO_CHARGE and clears SO/TR when entering it. `referencePayload(mode, orderId, manualTr, reason, note)` returns `{ referenceMode: "NO_CHARGE", noChargeReason, noChargeNote }` for NO_CHARGE (always sent, so the server validates). Edit form pre-fills from the record via `referenceModeForRecord`.
- [ ] **Step 4: Client checks.** In Save & Print, Save Draft and edit save, when mode is NO_CHARGE run `resolveDeliveryReference` and `toast.error(result.error)` on failure. Update the missing-mode toast to `Choose a reference type first.`
- [ ] **Step 5: Contracts.** In Save & Print (~L1120), skip contract matching when mode is `NO_CHARGE` (`contractLines` stays `[]`).
- [ ] **Step 6: PO No.** Enabled when mode is `TR_NUMBER` or `NO_CHARGE` (create ~L1603, edit ~L1924).
- [ ] **Step 7: Create SI buttons.** Hide the "Create SI" action at `page.tsx` ~L985 and in `delivery-receipt-preview-modal.tsx` ~L149 when `isNoChargeDelivery(dr)`.
- [ ] **Step 8:** `npx tsc --noEmit` and `npm run lint` → clean.
- [ ] **Step 9: Manual check** (use the `run` skill): create a Warranty DR with PO, print it (shows `WARRANTY`), confirm list shows `WARRANTY` / `No charge`; try Other with blank note (blocked); edit a TR DR into Gift and back to TR.
- [ ] **Step 10:** Commit `feat(deliveries): No charge option on the DR form`.

---

### Task 4: Keep no-charge DRs out of billing

**Files:**
- Modify: `src/app/dashboard/service-invoices/service-invoices-client.tsx` (DR option builders at ~L389, ~L416, ~L519; prefill ~L423)
- Modify: `src/lib/invoiceRepository.ts` (`resolveInvoiceReferences` ~L261)

**Interfaces — Consumes:** `isNoChargeDelivery`, summary `noChargeReason` (Task 2), `resolveDeliveryReceiptReferences().noChargeReason`.

- [ ] **Step 1:** Filter `!isNoChargeDelivery(d)` in all three `setDrOptions` builders (one shared helper in the file). In the prefill handler, if the DR is no-charge, `toast.error("A no-charge DR can't be billed.")` and stop.
- [ ] **Step 2:** In `resolveInvoiceReferences`, when the linked DR's `noChargeReason` is set, throw `new InvoiceBillingError("A no-charge DR can't be billed.")`. This covers Service and Sales invoices, create and update.
- [ ] **Step 3:** `npx tsc --noEmit` → clean. Manual: the Linked DR dropdown in both Service and Sales invoices omits the Warranty DR from Task 3.
- [ ] **Step 4:** Commit `feat(invoices): no-charge DRs can't be billed`.
