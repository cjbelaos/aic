# Sales Order Writer (Apps Script gateway)

Status: corrected locally; not deployed or verified against Google runtime.

## Transaction and protocol

The gateway validates HMAC and the hash of the received payload, takes the
project-wide script lock, stages source cell changes in memory, and submits
one `Sheets.Spreadsheets.batchUpdate` including the command receipt. Staging
is not a SpreadsheetApp write cache: only the explicit batch mutates cells.
`SpreadsheetApp.flush()` is not a transaction and is not used.

Enable the **Advanced Google Sheets service (v4)** in the Apps Script project.
All canonical tabs must already exist with the exact repository headers and
column widths. User strings are written using `stringValue`, never formulas.

ContentService returns JSON with `status`, `ok`, and `result`/error fields;
it cannot set arbitrary HTTP status codes. The Next.js client translates the
semantic status into the application API error contract.

Business commands carry a server-generated `requestHash` of the original
parsed intent (actor, operation, order ID, input). The full generated payload
has a separate signed hash. `so.receipt` checks the original intent before
state-dependent validation or generating UUIDs/timestamps. Receipts are bound
to the actor. Retain receipts for the full supported retry lifetime.

## Synchronization

Configure the reporting destination before confirmation. Outbox rows are
created even while publication is disabled. `SYNC_ENV` controls publication,
not whether changes are queued. The gateway builds the publication from the
latest source snapshot under its lock; schedulers only identify due jobs.

Transactions are separate: source mutation + outbox; durable lease claim;
destination publication; verified source acknowledgment. An expired lease
can be claimed again. Destination immutable keys, version and hash prevent
blind appends and detect edits to app-owned values. Inventory/delivery/aging
columns Q:T and W are never written. Removed lines remain as INACTIVE rows.

Before enabling sync on a staging copy, append these consecutive headers
**after the verified last occupied column, and never before X**:

`AppSalesOrderId, AppSalesOrderItemId, AppOrderVersion, AppSyncedAt, AppLineStatus, AppOrderStatus, AppFulfillmentStatus, AppPayloadHash`

The worker resolves their position from the headers and fails closed if the
layout is absent or unexpected. It writes only A:P, U:V and those eight
technical columns. Conflicts require review; retries do not overwrite them.
For migrated orders, every line requires an import-map entry with status
`REVIEWED` and a destination row already backfilled with IDs and a verified
baseline payload hash. Unreviewed imports cannot publish.

## Script Properties (values stay out of source control)

- `GATEWAY_SHARED_SECRET`: matches server `SALES_ORDER_GATEWAY_SECRET`.
- `SOURCE_SPREADSHEET_ID`: authoritative configured application database.
- `DESTINATION_SPREADSHEET_ID`, `DESTINATION_SHEET_ID`: reviewed reporting target.
- `SYNC_ENV`: `staging`, `live`, or disabled/blank.
- `SYNC_ALLOW_LIVE`: additionally requires `1` for live publication.

Next.js uses `SALES_ORDER_GATEWAY_URL`, `SALES_ORDER_GATEWAY_SECRET` and the
existing destination environment settings. Verify both runtimes name the
same source/destination pair. Never redirect existing application modules.

## Verification and deployment gate

`npm run test:sales-orders` executes actual Code.gs and the real TypeScript
service/client/repository with mocked Google boundaries. It tests hashes,
semantic errors, commit failure, receipts, concurrent service calls, stable
line identity, source outbox, formula preservation, destination conflicts,
and lease recovery after a lost acknowledgment. This is local evidence,
not a claim that real Google services have been exercised.

Before deployment approval: verify project authentication/access, enable the
Advanced Sheets service, provision and inspect staging schemas, test source
batch failure and overlapping confirmations, run the scheduled worker on a
staging copy, simulate lost responses and acknowledgment failure, verify
sorting/ID backfill/formulas, and record timings and quota behavior. A
five-minute trigger cannot meet a one-minute sync target; choose and measure
the trigger interval during the deployment spike.

Production cutover, legacy write-path shutdown, business rules and ADR
acceptance remain separate approval/evidence gates. No deployment or live
spreadsheet changes were made by the local correction work.
