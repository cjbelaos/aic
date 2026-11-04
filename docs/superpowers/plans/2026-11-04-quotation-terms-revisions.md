# Quotation terms and revisions Implementation Plan

> For agentic workers: execute the approved plan with test-first changes, then perform an independent final review.

**Goal:** Require payment terms, preserve document terms, and support revised sends with immutable history.
**Architecture:** Add Delivery, Warranty, Revision, RevisionPending and LastSentAt after existing quotation columns. Use QuotationHistory for sent snapshots and separate Drive PDFs; serialize each quotation's mutations and validate saved content before SMTP.
**Tech Stack:** Existing Next.js App Router, React, TypeScript, Google Sheets/Drive, Nodemailer.
**Spec:** docs/superpowers/specs/2026-11-04-quotation-terms-revisions-design.md

## Global constraints
- No customer emails, live data repairs, commits, deployments or new dependencies during implementation.
- Preserve existing columns A:V, historical references, prices and audit identities.
- Payment terms required on all saves; delivery and warranty required for sends; No warranty is valid.
- Increment revision only after successful sending. Retain old snapshots/PDFs.

## Review focus
- Legacy sent records missing terms must remain viewable and retain original PDFs before revision.
- Concurrent edit/send and stale PDFs must fail safely; SMTP uncertain outcomes must not trigger duplicate sends.
- A saved revision is distinct from the last successfully sent version; repeated sends of unchanged content do not advance revision.
- Every create/update/status/send entry point must enforce its validation and history rules.
- History viewing must be read-only and protected by existing authentication.

## Tasks
- [x] Extend row schema, types and validation with round-trip/historical tests; wire all persistence entry points.
- [x] Implement history, immutable PDF saving, mutation serialization and send lifecycle; test success/failure/stale/retry scenarios using isolated fakes.
- [x] Update form, actions, printable/PDF and history UI; test required terms and revision rendering.
- [x] Run quotation and related regression tests, TypeScript/build checks, and review; fix material findings.

## Execution decisions
- Work in the current IDE checkout and preserve the existing untracked reports; no git metadata changes or commits are authorized.
- Implement additive schema initialization lazily, without running it against the live database during this task.
- Tests use the repository's existing TypeScript runtime loader and focused assertion runners.
- Use one spreadsheet-wide quotation mutation lock behind the keyed lock API: physical header/child row deletion can shift another quotation's row index, and history appends share a sheet. This trades concurrent writes for consistent rows.

## Verification and review
- `npm run test:quotations`: passes all pure pricing/row/text tests and persistence, print rendering, client retries, send lifecycle, history storage and API tests.
- `npm run test:sales-orders`: passes all related quotation conversion and sales order tests.
- `npx tsc --noEmit --incremental false`: passes.
- Focused ESLint of new domain/storage modules, history/preview/print UI and send/PDF/history routes: passes.
- `npm run build`: passes after rerunning with network access for existing Google Fonts.
- Updated an existing discount test to assert its intended discount totals independently of already-existing additional invoice presentation fields; invoice calculations were not changed.
- Independent review reported lost-response duplicate retry, deletion of uncertain first sends, legacy grid-width reads and whitespace history bypass. All were fixed with regression coverage. The reviewer stopped at its usage limit before issuing a full final verdict; the integration/final review was completed by the primary agent.
- No customer emails, live quotation repairs, schema writes, deployment or git commits were performed.

## Approved revision email wording
Approved by the user on 2026-11-04. Original quotation messages retain their existing wording.

Subject: Revised Quotation [Quotation Number] — Revision [N] | Aerich Innovation Corp.

Dear [Client / Contact Name],

Please find attached Revision [N] of Quotation [Quotation Number] for [Quotation Description].

This revised quotation supersedes the version previously sent under the same quotation number. Please refer to the attached PDF for the updated scope, pricing, Terms of Payment, Delivery, and Warranty.

Kindly review the revised quotation and let us know if you have any questions or require further clarification.

Thank you.

Best regards,
[Sender Name]
[Department / Position]
Aerich Innovation Corp.
[Contact Number]
