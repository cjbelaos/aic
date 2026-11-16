# FTI fuel recalculation: rollout and recovery

## Behavior

Saving the shared fuel price updates eligible unapproved trip rows dated today or later in Asia/Manila, using the technician's current km/L setting (12 if absent/invalid). Past rows and approved requests are excluded. The price, revised fuel cells, request totals and pending PDF flags are saved together.

Approval sends the revision actually shown in the preview. If it differs from saved data, the app reloads the FTI and asks the approver to review and explicitly approve again. PDF upload now runs on the server from saved data. Old clients attempting to upload arbitrary PDF bytes or delete a PDF as rollback are rejected; refresh open browser sessions after rollout.

Linked PDFs keep their Drive file ID. Their app link is suppressed while pending or failed, and the UI explains that the stored amounts are current. Later edits to an FTI with a linked PDF mark it pending again. The renderer uses the saved fuel subtotals, not a fresh calculation that could change historical values.

## Deployment requirements

1. Deploy all these changes together. Old server deployments must no longer accept FTI writes: they do not participate in the shared lock or revision check. No deployment has been performed by this implementation task.
2. Configure a strong `CRON_SECRET` in the deployment environment. Do not put its value in source control. The authenticated `GET /api/fti/pdf-jobs` requires `Authorization: Bearer <CRON_SECRET>`.
3. `vercel.json` registers a daily retry at 00:00 UTC (08:00 Philippine time). Next.js `after` starts work immediately after a successful fuel-price/request/PDF-regeneration response. While pending work exists, the manager's fuel settings page also automatically invokes the authorized retry endpoint every 30 seconds. Failed jobs back off from 2 minutes up to 60 minutes; scheduled invocation times determine when a due job is actually retried. Each invocation handles at most three jobs and stops starting new jobs after 30 seconds.
4. For larger queues or faster unattended recovery, configure a scheduler appropriate to the hosting plan to call the same authenticated endpoint more frequently. Do not rely on an in-memory timer for unattended retries.
5. Existing Sheets credentials must allow adding/deleting sheets and writing cells. Existing OAuth Drive credentials must be able to update the linked PDFs and read stored approver signatures. The existing FTI Drive folder is reused.

On first relevant mutation, the application adds/validates request columns L:N: `PdfStatus`, `PdfRetryAt`, `PdfAttempts`. It refuses conflicting nonblank headers. These columns must be reserved for this workflow. No production schema migration was performed during development.

## Cross-instance coordination

The hidden `_FTI_WRITE_LOCK` sheet is an exclusive mutex: Google Sheets rejects adding a second sheet with the same title. Every participating FTI writer uses it, including legacy submission, repricing, approval and PDF replacement. Nested operations share the same owner. A competing writer returns an error and must be retried; no write is silently dropped.

The owner removes its sheet on completion. The lock deliberately has no automatic expiry. A killed function or uncertain remote-write outcome may retain it: letting another writer proceed while an earlier Sheets/Drive write might still complete would risk approving unseen amounts or overwriting a newer PDF. Manual edits directly in Sheets are outside this protocol.

If all FTI writes keep reporting an update in progress:

1. Stop new FTI mutations/cron invocations and inspect deployment executions. Confirm all earlier FTI operations and outstanding remote writes have finished; do not remove a lock just because it is old.
2. Inspect the affected request's status, fuel cells, total and L:N metadata. Compare with logs and any available backup. For an uncertain Drive replacement, check the linked file too.
3. Only after confirming no owner remains active, remove the hidden `_FTI_WRITE_LOCK` sheet. Do not delete any business-data tabs.
4. Resume service. Use the manager settings page or authenticated retry endpoint to drain pending PDF work. If a price save had an uncertain result, inspect the saved price and affected rows before retrying it.

## Verification

- `npm run test:fti` runs the domain, lock, PDF retry/invalidation, revision/auth, submission and read-only regression tests without live services.
- `npx tsc --noEmit --incremental false` checks types.
- Existing lint errors in the FTI page and legacy ftiSheets types are unchanged from HEAD; new workflow modules have no lint errors.
- A representative 32-trip PDF is generated locally at `tmp/pdfs/fti-recalculation-sample.pdf`. Visual inspection is currently blocked by Windows Application Control denying the temporary PDF renderer and unavailable browser automation. No visual sign-off or live Drive end-to-end test is claimed.

The separately authorized correction of CTRL-20261113192322 was completed and read-back verified earlier (total PHP 10,802.62). Development did not repeat it or modify other production FTIs.
