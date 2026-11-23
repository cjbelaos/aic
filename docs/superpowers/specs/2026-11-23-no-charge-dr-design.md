# No-charge Delivery Receipts — design

Date: 2026-11-23 · Size: small change

## Intent

Some DRs have no Sales Order and no legacy TR number behind them: warranty
replacements, gifts, samples. Today the create form blocks Save & Print and Save
Draft until a reference type is chosen
(`src/app/dashboard/delivery-releases/page.tsx` ~L1082, ~L1180). Staff need a
deliberate way to record these DRs, and anyone reading one later must see *why*
it carries no reference.

## Goals

- A third reference type, **No charge**, beside Sales Order and Legacy TR Number.
- A required **reason**: Warranty, Gift, Sample, Other. **Other** requires a
  short note; the other reasons allow an optional note.
- The reason shows in the DR list and on the printed DR where the SO/TR number
  normally appears (e.g. "WARRANTY").

## Non-goals / anti-goals

- No-charge DRs **never** count against contracts. The auto contract matching
  (page.tsx ~L1120–1137) must skip them. Silently consuming contract quantity
  on free items is the failure this design exists to prevent.
- No-charge DRs are **not billable**: hidden from the Service Invoice
  "Linked DR" dropdown (both create and edit, all billing modes).
- No change to stock deduction or approval rules; they apply as for any DR.
- No Sales Order fulfillment posting (already true: no SalesOrderId).

## Approaches considered

- **A. Third mode in the existing reference selector (chosen).** One place
  decides what kind of DR this is; extends the existing two-mode plumbing.
- B. Separate "No-charge DR" switch that hides the selector. Rejected: two
  controls that can contradict each other; every check must read both.

## Design

- `src/lib/deliveryReference.ts`: add mode `NO_CHARGE` and a reason enum
  (`WARRANTY | GIFT | SAMPLE | OTHER`). `resolveDeliveryReference` validates
  reason (required) and note (required for OTHER), clears SalesOrderId and the
  TR number. Display/kind-label helpers return the reason label for no-charge
  records. `referenceModeForRecord` / `deliveryReferenceFromRow` recognise a
  stored reason before falling back to "no SalesOrderId ⇒ TR".
- **Storage:** new DeliveryReceipts columns **Z: NoChargeReason** and
  **AA: NoChargeNote** (Y is ForCompanyId). Column E stays empty for no-charge
  DRs, so nothing reading E mistakes "WARRANTY" for a TR number. Extend the
  read range to `A2:AA`. Existing rows have empty Z/AA and behave as today.
- **Form (create and edit):** selector shows three choices; No charge reveals a
  Reason select and Note input. PO No. stays editable in this mode.
- **Contracts:** when mode is NO_CHARGE, send no `contractLines`; the API also
  rejects contract lines on a no-charge DR (defence in depth).
- **Service invoices:** exclude DRs with a NoChargeReason from `drOptions`.
- **API** (`src/app/api/deliveries/route.ts`): accept and validate the new mode,
  persist Z/AA on create and update.
- Tests: extend `scripts/delivery-release-tests/reference-test.ts` for the new
  mode (validation, row values, row parsing, display label).

## Left to the builder

- Exact print-template location for the reason label.
- Whether contract-release DRs (which already skip the reference) can also be
  no-charge: assume not; contract releases keep their current path.
- Switching an existing DR into or out of No charge on edit follows the same
  mutual-exclusion rule as the other modes (clear the other values).
