# Sales Orders correction checkpoint

Updated: 2026-09-20. Status: review blockers corrected locally; deployment and
full module acceptance remain unverified. This supersedes earlier claims that
all phases were complete.

## Corrected

- Apps Script HMAC/digest use documented signatures and hexadecimal hashes.
  ContentService carries semantic status in JSON; the client checks it.
- Source writes are staged and committed using one explicit Sheets API
  batchUpdate, including history, sequence, receipt and outbox. No flush-based
  transaction or rollback assumption remains.
- Retry intent is stable across generated UUIDs/timestamps. Receipt lookup
  precedes state validation; browser retries retain the command ID after an
  ambiguous failure. Receipts are bound to actor and original parsed input.
- Confirmed revisions enqueue jobs independently of worker enablement.
- Sync reads fresh source state under the gateway lock. A:P, U:V and verified
  technical columns are written separately; Q:T/W remain untouched. Technical
  headers must be provisioned after occupied legacy columns. Existing hashes,
  versions and keys are checked; migrated rows require reviewed maps/backfill.
- Editing preserves line IDs and fulfillment quantities. Removed unfulfilled
  lines remain INACTIVE; fulfilled lines cannot be silently removed.
- Migration uses RAW text, independent append positions, strict read failures,
  existing-header validation and changed-source-hash rejection. Missing values
  remain blank; incomplete source lines are retained for review. Apply requires
  an explicitly configured isolated SALES_ORDER_MIGRATION_STAGING_ID and an
  exclusive offline staging import window. Do not run concurrent import writers.

## Regression evidence

The standard `npm run test:sales-orders` command now also executes
`scripts/sales-order-tests/apps-script-test.mjs`. It loads actual Code.gs plus
the real TypeScript service, client and repository; only Google reads/writes
and HTTP transport are replaced. It covers atomic failure, payload signing,
semantic errors, create/confirm/edit retries, parallel confirmations, stable
line IDs, formula preservation, manual conflicts, and lost-ack lease recovery.
Migration self-tests cover replay, differing table lengths, missing values,
changed snapshots and read errors. These tests do not prove live Apps Script
behavior, browser interactions or production workbook compatibility.

Correction-pass checks (2026-09-20): `npm run test:sales-orders` passed;
`npx tsc --noEmit` passed; focused ESLint passed with no warnings/errors;
`git diff --check` passed. `npm run build` passed after network access was
allowed for the existing Google Fonts downloads; the restricted-network run
failed fetching fonts. No live Google workbook tests were performed.

## Remaining acceptance work

- Deploy only after authorization, enable Advanced Sheets v4, validate real
  runtime/authentication and staging schema/ownership/ID backfill.
- Run staging import, reconciliation, browser and PDF/Drive workflows.
- Confirm business tax/discount, approval, evidence and role rules.
- Linked document references do not constitute a completed DR-creation workflow.
  Full delivery creation and reconciliation remain module acceptance work.
- Review service completion, quotation/pricing behavior and all plan acceptance
  criteria before calling the entire Sales Orders module complete.
- ADR-002 remains Proposed. The earlier KOS completion statement should be
  reconciled with this checkpoint; this correction did not change KOS files.

No credentials, deployment, production workbooks, git commits or remotes were
changed. See the writer README for the corrected protocol and staging gates.
