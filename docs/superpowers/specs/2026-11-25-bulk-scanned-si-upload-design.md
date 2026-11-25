# Bulk upload of scanned Service Invoices — design

Date: 2026-11-25 · Size: small feature

## Why

Signed, returned Service Invoices are scanned in batches, and the scanner produces one PDF holding
10–20 invoices. Attaching them today means splitting the PDF by hand and using the per-row upload
icon once per invoice. The goal is one upload per batch, with each page attached as the right
invoice's **Scanned copy** and stored in the new Drive folder.

## Goals

- From the Service Invoices page, pick one multi-page PDF and split it into one PDF per page.
- Read the red invoice number on each page automatically, in the browser.
- Show a **check screen** before anything is saved. Each row shows the page thumbnail, the invoice
  number that was read (editable), and what the system holds for that number (customer, total,
  status).
- **Save all** uploads every confirmed page through the existing scanned-copy flow. A new scan
  replaces an invoice's existing scan.
- All Service Invoice scanned copies (single and bulk) go to Drive folder
  `1bUpm-7ExZzgBvcmqBNd24iw6n3q_R1IM`, replacing `166LGOl4qTL4Ukabnrk335OT0ccLQnCq_`.

- The **Scanned** badge in the Scanned copy column becomes a link that opens that invoice's scan
  (`scannedFileLink`) in a new tab. (Added 2026-11-25 at Chris's request.)

## Non-goals

- Sales Invoices: no change. Same page component, but no bulk button, and their scans stay in the old folder.
- Saving automatically without review.
- Reading numbers with an AI service.
- Moving or deleting scans already in the old folder. When a scan is replaced, the old Drive file is left where it is.

## Anti-goal

A signed copy attached to the wrong invoice without anyone noticing. Every page is visible next to
the system's customer and total before saving. Unread numbers and numbers that don't match any
invoice block saving until someone fixes or skips that page.

## Approaches considered

| | Approach | Trade-off |
|---|---|---|
| **A (chosen)** | Everything in the browser: `pdfjs-dist` renders the pages, `pdf-lib` splits them, `tesseract.js` reads the red number (using the red-ink crop idea from the Claude Desktop script) | No server change, no running cost, nothing installed on staff PCs. Can misread faint scans, which the check screen catches. About 10 MB downloaded the first time, then cached. |
| B | Same as A, but Claude reads the number | Most accurate. Needs an API key and costs per page, and invoice images leave the system. |
| C | No reading; staff type every number | Simplest. Tedious at 10–20 pages per batch. |

The Python script itself can't run on Vercel (needs Python, Tesseract and Poppler), and it only
splits the PDF; it doesn't attach anything.

## Design

**Entry point.** A "Bulk upload scans" button in the Service Invoices page header, shown only when
`!isSales` in [service-invoices-client.tsx](../../../src/app/dashboard/service-invoices/service-invoices-client.tsx).
It opens a dialog that accepts a single PDF.

**Processing (client-side, lazy-loaded so the page's normal load is unaffected):**
1. `pdfjs-dist` renders each page at about 150 dpi, once for a thumbnail and once for reading the number.
2. The number is read from a crop of the top-right area (about x 77–95%, y 7–16%, as in the script). Only red pixels are kept (black on white), the crop is scaled up, and `tesseract.js` reads it with a digits-only whitelist. The longest 3–6 digit run is the result.
3. `pdf-lib` copies each original page into its own PDF (original scan quality, not re-rendered), named `SI <number>.pdf`.

**Check screen rows:** page number · thumbnail (click to enlarge) · invoice number input · system
match from the already-loaded `invoices` list (customer, total, invoice status) · status badge ·
Skip toggle.

| Status | Meaning | Saving |
|---|---|---|
| ✓ Match | Number found, no existing scan | allowed |
| ⚠ Replaces scan | Invoice already has a scanned copy | allowed (replaces it) |
| ⚠ Cancelled/Void | Invoice exists but isn't active | allowed, flagged |
| ✗ Not found | No invoice with that number | blocked until fixed or skipped |
| ✗ Unread | No number read | blocked until typed or skipped |
| ✗ Duplicate | Same number on two pages in this batch | blocked until fixed or one is skipped |

**Save all:** uploads pages one after another through the existing
`serviceInvoiceService.uploadScanned` → `POST /api/service-invoices/upload-scanned`. That route
already overwrites column J and the scan metadata. Each row shows its own result. Failed rows stay
on the screen with a Retry button. The list refreshes when all uploads finish.

**Server change:** only the folder constant in
[service-invoices/upload-scanned/route.ts](../../../src/app/api/service-invoices/upload-scanned/route.ts).
Checked 2026-11-25: the Drive upload user (OAuth refresh token, "Aerich Innovation Corp") has
`canAddChildren` on the new folder ("SERVICE INVOICE").

## Builder's calls (stated, open to correction)

- New dependencies: `pdfjs-dist`, `pdf-lib`, `tesseract.js`. The Tesseract code and English data load from its default CDN. Page images are processed only in the browser.
- The 10 MB per-file limit stays. Single pages are well under it.
- Number reading lives in a small pure module (red-ink mask, digit parsing, row status), so it can be tested without a browser.
- Verified against Chris's real 9-page sample scan (`C:\Users\chris\OneDrive\Documents\Scan2026-11-25_102818.pdf`, 5.8 MB) before calling it done. Expected reads: 1599, 1816, 1815, 1813, 1814, 1750, 1819, 1659, 1817.
