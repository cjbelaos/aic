# Source-to-destination data inventory (plan §1)

Captured 2026-11-27 by `scripts/migration/inspect-workbooks.mjs`: read-only scope, structure only. Raw output is `tmp/migration/workbook-inventory.json` (git-ignored). Row counts use non-empty column A cells below the header.

## Workbooks

| Workbook (env var) | Tabs | Role |
| --- | --- | --- |
| Database (`GOOGLE_SHEET_ID_DATABASE`) | 81 | **Operational source.** Practically formula-free (one ARRAYFORMULA in `MOA`). About 13k data rows. |
| Field Tech Itinerary Form Test (`GOOGLE_SHEET_ID_FTI`) | 12 | Legacy. The app appends approved FTIs to `FTIList`, whose per-technician Summary tabs are formulas. **Output destination.** |
| AIC Schedule Calendar, New Flow (`GOOGLE_SHEET_ID_NEWFLOW`) | 3 | All tabs empty. Schedules and Itineraries are unreferenced. **Drop** (confirm). |
| Sales Order Tracker (`SALES_ORDER_DESTINATION_*`, also the client directory) | 9 | Staff-facing tracker written by the sales-order sync. **External destination.** |
| Invoice and Payment Tracker (`SERVICE_INVOICE_TRACKER_*`, hard-coded fallback ID) | 17 | Finance tracker written by the invoice tracker sync. Heavy formulas. **External destination.** |

Drive folders (`GOOGLE_DRIVE_*_FOLDER_ID`) receive PDFs, scans, receipts, signatures and service-report files. **External destinations.** Database rows keep their links.

## Database workbook dispositions

**Import as tables.** Every column, business key preserved as text (leading zeros), money as `numeric`, Drive links kept verbatim.

| Area | Tabs (rows) | Business key | Notes |
| --- | --- | --- | --- |
| Identity | Users (23), UserRoles (2), Departments (4), Positions (9), UserApprovers (13), UserFuelPerKm (7) | UserId (UUID), Username | `Password_Hash`/`Salt` imported as secrets and never logged. `UserRoles` is unreferenced by code but kept as the role lookup. |
| Master data | Companies (378), CompanyContacts (64), LocationAddresses (413), Products (1021), SupplierProducts (817), ProductCategories (7), ProductUnits (26), PaymentTerms (3), CustomerPrices (4), Warehouses (4), Vehicles (5), Miscellaneous (18), DeliveredByNames (5), Toll Matrix Table (74×75) | Ids per tab | Companies covers customers, suppliers and billing companies (`BillingCompanyId` self-reference). ProductCategories has an unnamed 5th column. Toll matrix becomes a long `(entry, exit, fee)` table. |
| Contracts | Contracts (46), ContractItems (129), ContractNotes (33), ContractReleases (153), ContractPeriodSummary (144) | ContractId | Period summary looks derived. Rebuild it and compare against the import, rather than trusting it. Header typo `PmsCycleStar`. |
| Delivery receipts | DeliveryReceipts (468), DeliveryReceiptItems (1500), DeliveryReceiptStatusHistory (92) | DRNumber | Items have an unnamed 11th column. StatusHistory's first header reads `3`, which should be the DR number. |
| Invoices | ServiceInvoices (285), ServiceInvoiceItems (512), SalesInvoices (21), SalesInvoiceItems (61), ProformaInvoices (13) | InvoiceNo | Service and sales invoices share a layout. Items have no line id, so the key is (InvoiceNo, row order). Proforma keeps `ItemsJSON`. |
| Quotations | Quotations (67), QuotationDetails (156), QuotationNotations (9), QuotationHistory (52) | QuotationNo | Details have no line id, so the key is row order. History holds sent snapshots (`SnapshotJSON`). |
| Sales orders | SalesOrders (151), SalesOrderItems (418), SalesOrderHistory (532), SalesOrderDocuments (255), SalesOrderFulfillments (149), SalesOrderDocumentLinks (0), SalesOrderSequences (1), SalesOrderCommands (530), SalesOrderImportMap (0) | SalesOrderId / SalesOrderNo | Commands are idempotency records. Sequences become the next-number source. |
| Service reports | ServiceReports (3), ServiceReportHistory (10), ServiceReportSequences (1), ServiceReportCommands (9), WaterTreatmentServiceReportDetails (2, 89 cols) | ServiceReportId | |
| Purchasing | PurchaseOrders (53), PurchaseOrderItems (111), PurchaseOrderStatusHistory (2), PurchaseRequests (13), PurchaseRequestItems (54), PurchaseRequestLinks (0) | PONumber, PrNo | |
| Inventory | StockMovements (41), StockTransfers (1), StockTransferItems (1), SafetyStock (1) | ids | |
| FTI and liquidation | FTIRequests (226), FTIDetails (1014), FTILegs (696), FTISegments (759), FTIExpenses (481), FTISettings (1), Liquidations (116), ReceiptItems (1230) | ControlNo, LiquidationId | See "Approvals and history" below. |
| Other operations | DocumentHandover (750), ScheduledCollections (22), CollectionHistory (1), Attendance (4), FieldWorkLogs (1) | ids | |

**Not imported.**

| Tab | Disposition |
| --- | --- |
| Config | **Excluded.** A1 holds what appears to be an OAuth refresh token. No code reads it. Owner action: delete it from the sheet and revoke it. |
| DeliveryReceiptForm, ServiceInvoiceForm, PurchaseOrderForm | PDF templates, not records. Stay in Google. Staging gets its own template copy. |
| `_FTI_WRITE_LOCK`, `_INVENTORY_WRITE_LOCK` (created on demand) | Replaced by database transactions and row locks. |
| DeliveryReceiptItems_Legacy (182) | Unreferenced pre-migration items. **Owner decision:** archive table or drop. |
| MOA (60) | Unreferenced manual agreement list with a formula status. **Owner decision:** archive or drop. |
| ScheduleCalendar (0) | Empty and unreferenced. Drop. |

## External destinations staging must redirect

| Writer | Destination | Staging handling |
| --- | --- | --- |
| Sales-order tracker sync (`salesOrders/trackerWriter.ts`, gateway `SALES_ORDER_GATEWAY_URL`) | Sales Order Tracker workbook | `SALES_ORDER_SYNC_ENABLED=false` initially. Then a copy of the workbook. |
| Invoice tracker sync (`serviceInvoiceTracker/*`, `proforma/tracker.ts`) | Invoice and Payment Tracker plus Client Directory | Env-override IDs to staging copies. The hard-coded fallback IDs must become a startup error in staging. |
| FTI approval mirror (`exportFTIListOnApproval`) | FTI workbook `FTIList` | Staging copy, or disabled. |
| PDF generation (DR, SI, PO, quotation, FTI, service report) | Drive folders plus Form templates | Staging Drive folders and template copies. |
| Cron `/api/fti/pdf-jobs` (`vercel.json`, daily) | Drive | Omitted from the staging project until destinations are verified. |
| Email (`SMTP_*`, quotation sending) | Customers | Staging must not reach real recipients. Use a sink or allow-list. |

## Users, roles and reporting lines

- Roles: `Users.UserRoleId` (1 = Admin, otherwise user). Super-admins come from the `SUPER_ADMIN_USER_IDS` allow-list. Credentials: `Password_Hash` + `Salt` (see `src/lib/password.ts`). Sessions are signed cookies.
- Reporting lines exist only as **approver assignments**: `UserApprovers(DepartmentId, RequesterUserId, ApproverUserId, ApprovalLevel, ApprovalType)`, 13 rows. There is no manager hierarchy. "Indirect reports" (plan §5) must be derived by walking requester→approver chains.
- **Owner review:**
  1. Is an approver chain the same thing as the management line for return-for-revision? Example: if A approves B and C approves A, can C return B's FTI?
  2. Rows that apply by department rather than a single requester, and multiple `ApprovalLevel`s: which ones confer return rights?
  3. Users without an approver row: who may return their documents, other than superadmins?

## Approvals and history

- FTIRequests and Liquidations store one approval each: approver id, name, signature URL, date and comment. They hold no history of earlier approvals or returns.
- **Liquidation figures:** the app blocks amount and receipt edits unless the status is `SAVED` or `REQUESTED_FOR_CHANGE` (`liquidationSheets.ts` `replaceReceiptItems`, `updateLiquidationRequestedAmount`). It also rejects reopening `APPROVED` ones. So for approved liquidations, the current Sheet values are the approved values, unless someone edited the Sheet directly, which only Google's version history would show. The import snapshots them as the "approved revision".
- Cash returns: `ReturnDate`, `ReturnEvidenceFileId/Name`, `ReturnUpdatedBy/At` on Liquidations. Proof files stay in Drive. Preserve as-is (plan §5 Finance decision is still open).
- FTIDetails amounts are recalculated by `ftiRecalculation.ts` (fuel price × km, tolls). The import keeps stored values and does not recompute them.

## Audit columns

Decided 2026-11-27 (plan §2). About 25 tabs already carry some of `CreatedBy/CreatedAt/UpdatedBy/UpdatedAt` (also `Created_At`, `DateCreated`). Map these into the standard four columns, and leave them null where absent.
