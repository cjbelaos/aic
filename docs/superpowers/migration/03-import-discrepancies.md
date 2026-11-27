# Import discrepancy log (plan §3 exit check)

Snapshot `snapshot-staging-1`, captured 2026-11-27 08:40 UTC (sha256 `81c7a0cf…`). Investigated against staging on 2026-11-27. Every non-clean item in `import-report.json` is listed here with its cause and disposition. Record identifiers are business keys only.

**Result:** 76 tables, 14,431 rows loaded. 0 rejected, 107 excluded, 1 rekeyed, 65 orphaned references (nulled, original kept in `import_raw`), 4 unconverted cells and 1 unmapped cell.

## Handled by the importer

| Finding | Rows | Cause | Disposition |
| --- | --- | --- | --- |
| DR items under a negative draft number with no DR row | 107 (13 drafts) | **App bug, fixed** (`1a0e80e` on `main`). Promoting a draft with edited items wrote them under the real DR number and left the placeholder copies. 12 drafts match issued DRs 3708, 3741, 3772, 3773, 3916, 3917, 3930, 3931, 3933, 3967, 4019 and 4090. | Excluded (`report.excluded`). The live sheet still holds the copies, which is harmless. |
| Draft −1795437044 (23 Nov), `DeliveryReceiptItems` row 1450 | 1 | No issued DR matches. A deleted draft, confirmed by Chris on 2026-11-27. | Excluded. Resolved. |
| Two different contacts share `cont_25` (rows 25 and 26) | 1 | **App bug, open.** New contact IDs are `cont_<rowCount+1>` (`companyContactSheets.ts:87`), and deletes remove rows, so the next contact reuses a live ID. | Second contact kept as `cont_25~r26` (`report.rekeyed`). Nothing references contacts by ID. |
| FTIDetails `Kilometer` / `FuelPrice` / `TollFee` = literal `"NULL"` | 141 cells, 33 FTIs | Older FTI code wrote the text `NULL` for blank amounts. All are on `SAVED` (unsubmitted) FTIs, Oct 2025–Jul 2026. | Imported as SQL null. |

## Orphaned references (parent record was deleted)

The app hard-deletes companies, contacts and contracts (`deleteDimension`) without checking what still references them. Products have no delete feature, so those rows were removed from the sheet by hand. In PostgreSQL, the foreign keys block such deletes. Each child keeps its own snapshot fields, such as product code and description, so documents still read correctly.

| Reference | Rows | Missing parent | Notes |
| --- | --- | --- | --- |
| `*.product_id` (DR items 24, supplier products 11, SO items 5, PO items 1) | 41 | 14 product IDs, all of the gaps in 1–1035: PROD-000082, 083, 171, 193, 194, 195, 202, 380, 451, 452, 453, 496, 513, 592. Nine are used on DRs, SOs or POs. Five (083, 194, 452, 453, 513) appear only on supplier price rows. They were last used 10–11 Nov, so they were removed between about 11 and 26 Nov. The API-visible revisions start on 26 Nov. | Some have a surviving sibling with the same code stem (for example SU-BLEAGEN-0081), so they are probably de-duplicated. PR-100L100 (PROD-000171/195) has no replacement and is on 13 DRs. **Owner (2026-11-27):** restore as inactive from a version-history copy of about 11 Nov. Scope (all 14, or the 9) is pending. |
| `contract_releases.contract_id` / `contract_item_id` | 4 + 4 | CTR-0007 (items CTI-0015–0018) | Completed releases REL-0003–0006 outlived their contract. The delete cascade did not catch them, possibly from older code. |
| `contract_period_summary.contract_item_id` | 6 | CTR-0007, CTR-0041 items | The contract delete does not cascade to the period summary, which is a derived table planned for rebuild. |
| `service_invoices.contract_id` | 1 | CTR-0041 | Invoice 1713 (created) was billed against a contract that was later deleted. **Owner:** confirm. |
| `company_contacts.company_id`, `supplier_products.supplier_id`, `purchase_orders.supplier_id` | 1 + 1 + 1 | COMP-377, COMP-119 | PO AIC-PO-2026-0022 is already `deleted`. |
| `sales_order_history.sales_order_id` | 2 | SO `9688abe8…` | History events (created, document attached) of a sales order that was removed from the sheet. |
| `fti_details.control_no` | 1 | CTRL-20260804140714 | Detail row left after its FTI was deleted. |
| `service_invoice_items.invoice_no` | 2 | `DRAFT-1790819850358` (30 Sep), `NOVUS` | A leftover from a removed draft invoice, and a hand-typed value. Invoice draft promotion re-keys items correctly (`invoiceRepository.ts:1195`). |
| `delivery_receipt_status_history.dr_number` | 1 | −1788340907 | A `draft→created` entry logged under the placeholder by older code. DR 3708's history also has a Drive URL in `old_status`. |

## Remaining cells

- MOA `Date of Agreement` / `Binding Date` / `Expiring Date`: 4 cells hold slash-text dates, which are ambiguous between D/M and M/D, plus one `.`. Kept in `import_raw`. MOA is a legacy tab awaiting an owner archive-or-drop decision.
- FTIRequests column 19 (no header): 1 value, kept in `import_raw`.
