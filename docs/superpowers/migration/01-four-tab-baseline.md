# Four-tab baseline (plan §1)

Recorded 2026-11-27. Static trace of the current Sheets-backed app; a timed live run is pending (see "Live measurement").

## Scenario

One account opens Delivery Receipts (`/dashboard/delivery-releases`), Service Invoices, Quotations and a second Delivery Receipts tab in quick succession.

## Root cause

Every server call to Google uses one service account, so all staff share a single Google "user" quota: **60 read requests per minute per user per project** (300 per project). Over the limit, Google returns HTTP 429 ("Quota exceeded … per minute per user"), which matches the paraphrased "app exceeds its per-minute quota". Source: [Sheets API usage limits](https://developers.google.com/workspace/sheets/api/limits).

No list endpoint caches or filters. Each endpoint re-reads entire tabs, and several nest further full-tab reads.

## Sheets read requests per page open

| Page | Browser API calls on mount | Sheets reads |
| --- | --- | --- |
| Delivery Receipts | `/api/deliveries` (DR tab, DR items, Companies), `/api/deliveries/drivers` (drivers tab, Users), `/api/companies`, `/api/products`, `/api/supplier-products`, `/api/product-references` (categories, units), `/api/product-units`, `/api/product-categories`, `/api/sales-orders` (one batchGet), `/api/users?username=` (Users) | ~14 |
| Service Invoices | `/api/service-invoices` (invoices, Companies, sales-order snapshot batchGet, DR links), `/api/deliveries` (3), `/api/companies`, `/api/auth/me` (0 when the session carries `fullName`) | ~8 |
| Quotations | `/api/quotations` (spreadsheet metadata + one batchGet) | ~2 |
| Delivery Receipts (2nd tab) | as above | ~14 |
| **Total** | | **~38 in a few seconds** |

One user doing the four-tab workflow consumes about two-thirds of the company-wide minute. Two staff doing it together, or one doing it next to any background work, exceeds 60 and gets 429s. Amplifiers:

- `withSheetsReadRetry` in the sales-order repository retries reads, which adds quota use while the bucket is already exhausted.
- Duplicate reads in one page load. Companies is read 3× on the DR page, and Users twice. Product categories and units are each read twice (directly and via `/api/product-references`).
- `getSheetsClient()` builds a new JWT client per call, so each call also fetches an OAuth token. This adds latency but not Sheets quota.

Authentication itself makes no Sheets read: the session is an HMAC-signed cookie (`src/lib/auth/session.ts`).

## Reproducible test

- Tracer: `SHEETS_TRACE=1` enables `src/instrumentation.ts`, which logs every `*.googleapis.com` request (method, path shape, status, ms; IDs and tokens redacted) to `tmp/google-api-trace.jsonl`.
- Driver: a Playwright script opens the four tabs 500 ms apart and records per-tab API status, timings, row counts and toasts. It mints a local-only session cookie and must never target production. Kept outside the repo; it will move to `scripts/migration/` with the staging acceptance test.
- **Acceptance (plan §6):** the same run against staging must show correct rows in all four tabs and **zero** Sheets lines in the trace.

## Live measurement

Not yet captured. Running `next dev` plus headless Chrome on the development laptop (15 GB, ~13 GB already in use) caused the machine to hang three times. The timed run will happen against the deployed staging and current apps instead, using the same driver.

## Security note found during tracing

`AUTH_SESSION_SECRET` falls back to the hard-coded string `aic-dev-session-secret` when unset, and it is not in `.env.local`. If production also lacks it, anyone can forge a session for any user ID. Verify the production Vercel env before cutover, and make the staging/production builds fail closed when it is missing.
