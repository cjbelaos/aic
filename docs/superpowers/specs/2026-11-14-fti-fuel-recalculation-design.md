# FTI fuel-price recalculation

## Intent and agreed behavior

Changing the global fuel price must automatically refresh eligible saved FTI computations so approvers review current amounts. The manager must not need to reopen or resave individual FTIs.

- Include DRAFT, SENT, SUBMITTED, REQUESTED_FOR_CHANGE, and REJECTED requests; exclude APPROVED requests and unknown statuses.
- Within each eligible FTI, recalculate only trip rows dated today or later in Asia/Manila. Past trip rows retain their stored price and computation, including in mixed-date requests.
- Use the new global fuel price and the technician's current km-per-liter rate. Preserve the existing 12 km/L fallback when no valid configured rate exists.
- Compute each eligible fuel subtotal as `(km / kmPerLiter) * fuelPrice`, rounded to two decimals using the existing computation convention.
- Recompute each affected request total from all its trip fuel subtotals, tolls, and miscellaneous expenses. Preserve distances, tolls, expenses, dates, status, and approval assignments.
- Automatically regenerate any linked saved PDF using the revised stored amounts. Keep its existing Drive link where possible. Do not create PDFs for requests that have never had one.
- Reject approval from an outdated preview. Reload the changed amounts and require a new explicit approval action; never automatically retry an approval on the user's behalf.

## Approaches

1. **Selected:** Persist revised amounts immediately, regenerate linked PDFs, and automatically retry failed PDF regeneration. A PDF failure does not undo valid recalculated amounts. Clearly show pending or failed PDF regeneration rather than reporting complete success.
2. Roll back an FTI's recalculation if its PDF cannot be regenerated. Not selected: it leaves eligible computations at the old price, and Sheets and Drive do not offer a shared transaction.

## Implementation constraints and builder decisions

Reuse the existing Google Sheets storage, fuel formula, authorization rules, and document content. No new business approval stages or notifications are required.

The current PDF renderer runs in the browser. The implementation must support automatic regeneration from authoritative saved data and durable retry state so failures are not silently lost. Retry execution and scheduling must be specified and verified in the implementation plan; a timer that dies with an HTTP request is insufficient. Deployment setup required for retries must be reported explicitly.

Use fresh server-side values for recalculation and approval validation. Prevent approval and repricing from racing in a way that modifies an approved FTI or approves unseen amounts; an in-process lock alone is insufficient if multiple server instances run. The implementation plan must settle this coordination mechanism before code is written.

Amounts and PDF revision must agree. A stale PDF must not overwrite a newer revision or appear to be current while regeneration is pending. Retrying PDF work must not reprice trips against a later calendar date or duplicate expenses.

No bulk correction of historical trips, changes to approved history, or changes to toll and expense calculations are in scope. General FTI refactoring is not required.

## Verification

Cover eligible and excluded statuses, Philippine date boundaries, mixed past/future rows, current technician rate and fallback, cent rounding, total calculation, repeated saves, and unauthorized price changes. Exercise approval with a stale preview and overlapping repricing/approval. Verify PDF contents, stable links, failed regeneration and retries, and stale PDF jobs. Confirm persisted values by reading them back.

## One-time correction completed separately

At Chris's explicit request, CTRL-20261113192322 was corrected on November 14, 2026. Its six trips dated November 16–21 now use PHP 79.20/L and the current 12 km/L technician rate. Fuel total changed from PHP 6,619.81 to PHP 5,548.62; request total changed from PHP 11,873.81 to PHP 10,802.62. It had no linked PDF. A local pre-change backup was retained and the written cells plus unchanged surrounding data were verified against a fresh read.

This correction does not implement the automatic workflow described above.
