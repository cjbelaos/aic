# Continuous agreement type — design

Date: 2026-11-25 · Size: small change

## Intent
Some customers (e.g. Saint Margaret Dialysis) have no signed hard copy and no end date: PMS continues
monthly until someone cancels. Today such a contract has to carry a fake end date, eventually shows as
Expired, drops out of the service-invoice PMS contract picker, and keeps an amber "Paperwork pending" tag.
That led to a duplicate contract being created because the real one was invisible when invoicing.

## Goals
- A contract can be marked "runs until cancelled, no paperwork".
- It never expires on its own, never shows renewal warnings, never shows "Paperwork pending".
- It always appears in the service-invoice PMS contract picker while Active.
- Cancelling it = setting status to Closed/Inactive, same as today.

## Non-goals
- Open-ended POs (a contract is Contract, PO, or Continuous — not a mix).
- Auto-migrating existing contracts; the user converts Saint Margaret by hand.

## Approaches
1. **New agreement type "Continuous"** — one choice drives end date, expiry, and paperwork. Stored in the
   existing AgreementType column (D); no new sheet column. **Chosen** — matches how the business talks
   about these customers and can't be half-configured.
2. "No end date" checkbox + new paperwork value "Not required" — more flexible, but two switches to remember;
   forgetting one brings the amber tag back. Rejected.
3. Detect from note text — fragile. Rejected.

## Design
- **Type**: `AgreementType = "Contract" | "PO" | "Continuous"` (also the contract-release agreement type).
- **Storage**: Continuous contracts save a blank EndDate. API requires EndDate only for Contract/PO.
  Switching a Continuous contract back to Contract/PO requires an end date again.
- **Status**: blank end date already keeps the stored status in `effectiveContractStatus`, so it never
  auto-expires. Closed/Inactive still apply.
- **Contract form**: "Continuous" added to the Agreement select. When chosen, the End date, paperwork, and
  notarized fields are hidden.
- **Contracts list**: Agreement badge "Continuous"; Term reads "Sep 21, 2026 – Ongoing" with no
  "Ends in…" line; Paperwork column reads "Not required"; no "Paperwork pending" tag; not matched by
  the Paperwork "Pending" filter; row highlight treated as ready (not amber). View dialog End Date shows
  "Ongoing". Export writes "Ongoing" in End Date.
- **Readiness**: `contractReady` returns true for an Active Continuous contract regardless of paperwork.
- **Entitlement ledger**: `generatePeriods` with a blank end date runs periods up to today, so
  contract-release tracking continues for Continuous contracts with entitlements.
- **Service invoices**: PMS contract picker and `pmsContractForDelivery` use `effectiveContractStatus`
  instead of the raw stored status (also stops date-expired-but-stored-Active contracts appearing).
- **Bug fix**: "Ended N days ago" only shows when the end date is actually in the past (fixes
  "Ended -300 days ago" on rows stored as Expired with a future end date).

## Left to the builder
Exact copy/placement in the form, test file locations, any other `agreementType === "PO"` checks that
need no change.

## Data follow-up (user, in the app)
Delete the duplicate Saint Margaret contract (Nov 25, 2026) if no invoice uses it; set the original to
Continuous + Active.
