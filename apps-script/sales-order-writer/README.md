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

## Tracker projection

Apps Script never copies data to the Sales Order Tracker. Next.js directly
reconciles each confirmed Sales Order after creation, edit, hold/resume,
cancellation, fulfillment, close, and legacy confirmation. It writes only
A:P and U:V, preserving the operational/formula columns Q:T and W. On the
first direct write, it automatically adds and hides the technical columns
X:AE; these hold stable order/line IDs so later changes update the existing
Tracker row instead of appending a duplicate. A removed source line clears
only its app-owned Tracker cells; it does not delete the Sheet row or damage
unrelated workflow values.

## Script Properties (values stay out of source control)

- `GATEWAY_SHARED_SECRET`: matches server `SALES_ORDER_GATEWAY_SECRET`.
- `SOURCE_SPREADSHEET_ID`: authoritative configured application database.

Next.js uses `SALES_ORDER_GATEWAY_URL`, `SALES_ORDER_GATEWAY_SECRET`,
`SALES_ORDER_DESTINATION_SPREADSHEET_ID`, and
`SALES_ORDER_DESTINATION_TRACKER_SHEET_ID`. The server-side Google credential
must have Editor access to the Tracker. Never redirect existing application
modules.

## Verification and deployment gate

`npm run test:sales-orders` executes actual Code.gs and the real TypeScript
service/client/repository with mocked Google boundaries. It tests hashes,
semantic errors, commit failure, receipts, concurrent service calls, stable
line identity, and direct confirmed-order creation. This is local evidence,
not a claim that real Google services have been exercised.

Before deployment approval: verify project authentication/access, enable the
Advanced Sheets service, test source batch failure and overlapping creates,
then verify a create, edit, cancellation, fulfillment, and removed line each
reconcile the Tracker without changing its Q:T/W formulas or manual workflow
columns.

Production cutover, legacy write-path shutdown, business rules and ADR
acceptance remain separate approval/evidence gates. No deployment or live
spreadsheet changes were made by the local correction work.
