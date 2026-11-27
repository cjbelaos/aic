# AIC database migration and private staging

## Outcome

Move operational records from Google Sheets to PostgreSQL and eliminate Sheets quota failures when opening DR, Service Invoices and Quotations together. Keep the current app authoritative until cutover.

## Deployment and data ownership

Use the existing empty Supabase project `yxevopwnqrbxoekclbda` for staging and a separate Vercel project for the private test app. Copy all users, roles and reporting relationships. Restrict site access to Chris independently of those copied accounts. Run one initial import for testing. At launch, import the latest live Sheets into a separate production database. Test transactions stay in staging.

This choice supports repeated tests against stable data. Continuous synchronization adds conflict handling that the two-copy workflow does not require. A module-by-module production cutover would split ownership of related invoices, receipts and orders.

## Staging isolation

Inventory every workbook, tab, formula, document identifier and relationship used by the app before mapping the schema. Preserve business identifiers and reconcile linked records. Keep database access server-side. Configure staging-only credentials and destinations for PDFs, Drive uploads, templates and trackers. Keep outbound jobs disabled until their destinations are verified, including the scheduled FTI PDF job in vercel.json.

## Acceptance

- Open DR, Service Invoices, Quotations and another DR tab in quick succession with one account. Each page must display the expected records on the first attempt with zero Sheets API calls, including authentication and shared lookups. Compare errors and load times with the existing app using comparable data.
- Verify that creating receipts and invoices preserves document numbers, line items, related orders and tracker behavior. Exercise simultaneous submissions and retry after an interrupted response.
- Provide independent return-for-revision actions for approved FTIs and expense liquidations. Managers and higher-level leaders may act within their reporting line. Superadmins may act across all employees. Verify both allowed and denied cases server-side.
- Requesters can edit and resubmit returned documents. Returning or changing an FTI leaves its approved liquidation and previously approved values intact. Updating approved liquidation figures requires a separate return, edit and reapproval. Verify with an FTI date or amount change.

## Cutover

Rehearse and time an import. Reconcile row counts, business keys, relationships, totals and approval states, and investigate discrepancies. Schedule a brief pause covering app submissions and direct Sheet edits. Drain in-progress writes, take the final copy, import it, verify, then switch the live app and reopen writes. If verification fails before reopening, resume on Sheets. After reopening, reconcile any new production database writes before any rollback. Make the old Sheets read-only for staff.

## Implementation prerequisites

Confirm the Vercel team and repository connection, owner-only deployment protection, authorized database access, and isolated Google destinations. Confirm how the current data represents reporting lines and historical liquidation values during schema discovery. Never infer missing historical values from a subsequently edited itinerary without review.
