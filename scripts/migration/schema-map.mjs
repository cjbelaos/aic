// Single source of truth for the Sheets → PostgreSQL mapping (plan §2/§3).
// generate-schema.mjs turns it into SQL; import.mjs uses it to load a snapshot.
//
// Column spec: "Header[=column_name]:type"  ("#N=column" maps an unnamed column by 0-based index)
// Types:  t text · i integer · n numeric (exact, unbounded) · d date · b boolean · j jsonb
//         ts timestamptz (ISO text, or a serial written as UTC wall-clock)
//         tm timestamptz (serial written as Asia/Manila wall-clock)
//         ca/cb/ua/ub → the standard audit columns created_at/created_by/updated_at/updated_by
//         (ca and ua accept ":tm" suffix semantics via "ca_tm"/"ua_tm")
// Business keys stay text unless they are numeric everywhere (dr_number). Unparseable cells
// become NULL and are kept verbatim in import_raw; nothing is dropped.
//
// pk: column name, or null for a surrogate `id bigint` + `line_no` (source row order).

export const SCHEMA = "aic";

export const TABLES = [
  // ── identity ───────────────────────────────────────────────
  { tab: "UserRoles", table: "user_roles", pk: "user_role_id", cols: "UserRoleId:i Description:t" },
  { tab: "Departments", table: "departments", pk: "department_id", cols: "DepartmentId:i DepartmentName:t" },
  { tab: "Positions", table: "positions", pk: "position_id", cols: "PositionId:i PositionTitle:t" },
  { tab: "Users", table: "users", pk: "user_id", unique: ["username"], secret: ["password_hash", "salt"],
    cols: "UserId:t Username:t FullName:t Email:t Password_Hash:t Salt:t UserRoleId:i DepartmentId:i PositionId:i Created_At:ca Last_Login:ts Signature:t RequiresApproval:t ContactNumber:t" },
  { tab: "UserApprovers", table: "user_approvers", pk: "config_id",
    cols: "ConfigId:t DepartmentId:i RequesterUserId:t ApproverUserId:t ApprovalLevel:i ApprovalType:t" },
  { tab: "UserFuelPerKm", table: "user_fuel_per_km", pk: "user_id", cols: "UserId:t KmPerLiter:n" },

  // ── master data ────────────────────────────────────────────
  { tab: "Companies", table: "companies", pk: "company_id",
    cols: "CompanyId:t CompanyType:t CompanyName:t TIN:t Address:t Latitude:n Longitude:n Status:t BillingCompanyId:t" },
  // Contact IDs were cont_<rowCount+1>, so a delete let the next contact reuse a live ID. Nothing
  // references contacts by ID, so a later duplicate is kept under "<id>~r<sourceRow>" instead of rejected.
  { tab: "CompanyContacts", table: "company_contacts", pk: "contact_id", rekeyDuplicates: true,
    cols: "ContactId:t CompanyId:t FullName:t Email:t Phone:t Is_Primary=is_primary:b" },
  { tab: "LocationAddresses", table: "location_addresses", pk: "location_id",
    cols: "LocationId:t LocationName:t Address:t Latitude:n Longitude:n CompanyId:t CreatedBy:cb CreatedAt:ca UpdatedBy:ub UpdatedAt:ua" },
  { tab: "ProductCategories", table: "product_categories", pk: "product_category_id",
    cols: "ProductCategoryId:t CategoryCode:t CategoryName:t Status:t #4=requires_serial:b TrackInventory:b" },
  { tab: "ProductUnits", table: "product_units", pk: "unit_id", cols: "UnitId:t UnitCode:t UnitName:t Status:t" },
  { tab: "Products", table: "products", pk: "product_id", unique: ["product_code"],
    cols: "ProductId:t ProductCode:t ProductName:t ProductCategoryId:t UnitId:t DefaultSellingPrice:n Status:t CreatedAt:ca CreatedBy:cb UpdatedAt:ua UpdatedBy:ub" },
  { tab: "SupplierProducts", table: "supplier_products", pk: "supplier_product_id",
    cols: "SupplierProductId:t ProductId:t SupplierId:t SupplierProductCode:t SupplierProductName:t SupplierDescription:t CostPerUnit:n IsPreferredSupplier:b Status:t CreatedAt:ca CreatedBy:cb UpdatedAt:ua UpdatedBy:ub" },
  { tab: "PaymentTerms", table: "payment_terms", pk: "payment_term_id",
    cols: "PaymentTermId:t Code:t Name:t Description:t DueDays:i DownPaymentPercent:n BalanceTerms:t Status:t SortOrder:i CreatedBy:cb CreatedAt:ca UpdatedBy:ub UpdatedAt:ua" },
  { tab: "CustomerPrices", table: "customer_prices", pk: "customer_product_price_id",
    cols: "CustomerProductPriceId:t CustomerId:t ProductId:t CustomerProductName:t PricePerUnit:n EffectiveFrom:d EffectiveTo:d Status:t CreatedAt:ca CreatedBy:cb UpdatedAt:ua UpdatedBy:ub" },
  { tab: "Warehouses", table: "warehouses", pk: "warehouse_id",
    cols: "Warehouse ID=warehouse_id:t CompanyId:t Code:t Name:t Address lines=address_lines:t City / Province / Postal code=city_province_postal:t Contact person / phone=contact_person_phone:t Active status=active:b Sort order=sort_order:i CreatedBy:cb CreatedAt:ca UpdatedBy:ub UpdatedAt:ua" },
  { tab: "Vehicles", table: "vehicles", pk: "vehicle_id",
    cols: "VehicleId:t Make & Model=make_model:t License Plate=license_plate:t Year:i Current Mileage=current_mileage:n Last PMS Date=last_pms_date:d Next PMS Date=next_pms_date:d Next PMS Mileage=next_pms_mileage:n Registration Expiry=registration_expiry:d Insurance Expiry=insurance_expiry:d Status:t CreatedBy:cb CreatedAt:ca UpdatedBy:ub UpdatedAt:ua" },
  { tab: "Miscellaneous", table: "miscellaneous", pk: "code", cols: "Code:t Description:t" },
  { tab: "DeliveredByNames", table: "delivered_by_names", pk: "delivery_option_id",
    cols: "DeliveryOptionId:t DisplayName:t Type:t Active:b Notes:t" },
  { tab: "FTISettings", table: "fti_settings", pk: "key", cols: "key:t value:n" },
  // Toll Matrix Table is positional (expressway groups are row ranges in tollMatrix.ts), so it is
  // stored losslessly as ordered rows: row_no (1 = header row) + cells (array of formatted strings).
  { tab: "Toll Matrix Table", table: "toll_matrix_rows", pk: "row_no", special: "grid", cols: "" },

  // ── contracts ──────────────────────────────────────────────
  { tab: "Contracts", table: "contracts", pk: "contract_id",
    cols: "ContractId:t CompanyId:t Description:t AgreementType:t PONumber=po_number:t StartDate:d EndDate:d Status:t MonthlyServiceFee:n Notes:t SoftCopyLink:t SignedCopyLink:t ServiceFeeFrequency:t PaperworkStatus:t NotarizedHardcopyStatus:t PmsCycleStar=pms_cycle_start:t ForCompanyId:t" },
  { tab: "ContractItems", table: "contract_items", pk: "contract_item_id",
    cols: "ContractItemId:t ContractId:t ProductId:t ProductCodeSnapshot:t EntitledQty:n Frequency:t Status:t" },
  { tab: "ContractNotes", table: "contract_notes", pk: "note_id",
    cols: "NoteId:t ContractId:t Text=note_text:t CreatedAt:ca UpdatedAt:ua" },
  { tab: "ContractReleases", table: "contract_releases", pk: "release_id",
    cols: "ReleaseId:t ContractItemId:t ContractId:t PeriodYear:i PeriodMonth:i PeriodQuarter:i Frequency:t ReleaseDate:d Quantity:n ReleasedBy:t Remarks:t Status:t DRNumber=dr_number:i" },
  { tab: "ContractPeriodSummary", table: "contract_period_summary", pk: "period_id",
    cols: "PeriodId:t ContractItemId:t ContractId:t ProductCode:t PeriodYear:i PeriodMonth:i PeriodQuarter:i Frequency:t EntitledQty:n ReleasedQty:n ReleaseCount:i FirstReleaseDate:d LastReleaseDate:d Status:t DaysToComplete:i PeriodStart:d PeriodEnd:d" },

  // ── delivery receipts ──────────────────────────────────────
  { tab: "DeliveryReceipts", table: "delivery_receipts", pk: "dr_number",
    cols: "DRNumber=dr_number:i DeliveryDate:d CompanyId:t PONumber=po_number:t SalesOrderNo:t SRNumber=sr_number:t Comments:t PreparedBy:t DeliveredBy:t CreatedAt:ca Status:t DriveFileLink:t CreatedBy:cb UpdatedBy:ub UpdatedAt:ua DeliveredById:t DeliveredByType:t DeliveredByOptionId:t SalesOrderId:t WarehouseId:t ApprovedBy:t ApprovedAt:ts ApprovalNote:t RequestedStatus:t ForCompanyId:t NoChargeReason:t NoChargeNote:t ScannedFileLink:t ScannedAt:ts ScannedBy:t" },
  { tab: "DeliveryReceiptItems", table: "delivery_receipt_items", pk: null,
    cols: "DeliveryReceiptId=dr_number:i ItemNo:i ProductId:t ProductCodeSnapshot:t DescriptionSnapshot:t Quantity:n UnitSnapshot:t Status:t DeliveryReceiptItemId:t SalesOrderItemId:t #10=serial_numbers:t WarehouseSources:t" },
  { tab: "DeliveryReceiptStatusHistory", table: "delivery_receipt_status_history", pk: null,
    cols: "#0=dr_number:i OldStatus:t NewStatus:t ChangedBy:t ChangedAt:ts" },
  { tab: "DeliveryReceiptItems_Legacy", table: "delivery_receipt_items_legacy", pk: null,
    cols: "DRNumber=dr_number:i ProductCode:t Quantity:n Unit:t Status:t" },

  // ── invoices ───────────────────────────────────────────────
  ...["Service", "Sales"].map((kind) => ({
    tab: `${kind}Invoices`, table: `${kind.toLowerCase()}_invoices`, pk: "invoice_no",
    cols: "InvoiceNo:t Date=invoice_date:d CustomerId:t PreparedBy:t CreatedBy:cb CreatedAt:ca UpdatedBy:ub UpdatedAt:ua Status:t DriveFileLink:t ContractId:t DRNo=dr_number:i AssignedTechnicianUserId:t AssignedTechnicianName:t ServiceReportId:t ServiceReportStatus:t PONumber=po_number:t TRNumber=tr_number:t SalesOrderId:t ManualCompletionData:j ReferenceMode:t",
  })),
  { tab: "ServiceInvoiceItems", table: "service_invoice_items", pk: null,
    cols: "InvoiceNo:t Description:t Qty:n Unit Price=unit_price:n Amount:n ProductId:t ProductCategoryId:t" },
  { tab: "SalesInvoiceItems", table: "sales_invoice_items", pk: null,
    cols: "InvoiceNo:t Description:t Qty:n UnitPrice:n Amount:n ProductId:t ProductCategoryId:t" },
  { tab: "ProformaInvoices", table: "proforma_invoices", pk: "id",
    cols: "Id:t InvoiceNo:t SourceInvoiceNo:t Status:t SalesOrderId:t SalesOrderNo:t TRNo=tr_no:t Date=invoice_date:d CustomerId:t CompanyName:t TIN:t Address:t PONo=po_no:t DRNo=dr_no:t Notes:t Remarks:t PreparedBy:t ItemsJSON=items_json:j TotalAmount:n PDFLink=pdf_link:t ScanLink:t Version:i SourceRow=legacy_source_row:i ImportIssue:t CreatedAt:ca CreatedBy:cb UpdatedAt:ua UpdatedBy:ub" },

  // ── quotations ─────────────────────────────────────────────
  { tab: "Quotations", table: "quotations", pk: "quotation_no",
    cols: "QuotationNo:t CustomerId:t Customer=customer_name:t Description:t Amount:n Discount:n ShippingFee:n PricingMode:t SingleTotalPrice:n PaymentTermId:t PaymentTerms:t File=file_link:t Date=quotation_date:t PreparedBy:t ApprovedBy:t SentBy:t Status:t CreatedBy:cb CreatedAt:ca UpdatedBy:ub UpdatedAt:ua DiscountSettings:j Delivery:t Warranty:t Revision:i RevisionPending:b LastSentAt:ts RecommendedByUserId:t RecommendedByName:t" },
  { tab: "QuotationDetails", table: "quotation_details", pk: null,
    cols: "QuotationNo:t ProductId:t ProductCodeSnapshot:t DescriptionSnapshot:t Quantity:n UnitSnapshot:t UnitPriceSnapshot:n CustomerId:t CreatedBy:cb CreatedAt:ca UpdatedBy:ub UpdatedAt:ua #12=line_metadata:j" },
  { tab: "QuotationNotations", table: "quotation_notations", pk: null,
    cols: "QuotationNo:t Notation:t CreatedBy:cb CreatedAt:ca UpdatedBy:ub UpdatedAt:ua" },
  { tab: "QuotationHistory", table: "quotation_history", pk: "send_id",
    cols: "SendId:t QuotationNo:t Revision:i State:t File=file_link:t SnapshotJSON=snapshot_json:j SentBy:t Recipient:t SentAt:ts MessageId:t Error:t SnapshotToken:t" },

  // ── sales orders ───────────────────────────────────────────
  { tab: "SalesOrders", table: "sales_orders", pk: "sales_order_id", unique: ["sales_order_no"],
    cols: "SalesOrderId:t SalesOrderNo:t LegacyTrackerNo:t ReceivedDate:d CustomerId:t CustomerNameSnapshot:t CustomerTINSnapshot=customer_tin_snapshot:t BillingAddressSnapshot:t ContactId:t ContactNameSnapshot:t ContactPhoneSnapshot:t DeliveryAddressSnapshot:t CustomerPONo=customer_po_no:t QuotationNo:t PaymentTermId:t PaymentTermsSnapshot:t RequiredDate:d AssignedToUserId:t Currency:t OrderStatus:t FulfillmentStatus:t SubtotalExTax:n DiscountTotal:n TaxTotal:n GrandTotal:n Remarks:t Version:i ConfirmedAt:ts ClosedAt:ts CancelReason:t ImportQuality:t CreatedAt:ca CreatedBy:cb UpdatedAt:ua UpdatedBy:ub DiscountSettings:j BillingType:t RecommendedByUserId:t RecommendedByName:t" },
  { tab: "SalesOrderItems", table: "sales_order_items", pk: "sales_order_item_id",
    cols: "SalesOrderItemId:t SalesOrderId:t LineNo=line_no:i OrderCategory:t LineType:t ProductId:t ProductCodeSnapshot:t ProductNameSnapshot:t CustomerProductNameSnapshot:t Description:t UnitId:t UnitSnapshot:t Quantity:n UnitPrice:n PriceSource:t CustomerProductPriceId:t QuotationLineReference:t DiscountAmount:n TaxMode:t TaxRate:n SubtotalExTax:n TaxAmount:n LineTotal:n FulfilledQty:n CancelledQty:n LineStatus:t PriceOverrideReason:t CreatedAt:ca CreatedBy:cb UpdatedAt:ua UpdatedBy:ub" },
  { tab: "SalesOrderHistory", table: "sales_order_history", pk: "event_id",
    cols: "EventId:t SalesOrderId:t SalesOrderItemId:t EventType:t FromStatus:t ToStatus:t ChangedFieldsJson=changed_fields_json:j Reason:t CommandId:t ActorUserId:t CreatedAt:ca" },
  { tab: "SalesOrderDocuments", table: "sales_order_documents", pk: "document_id",
    cols: "DocumentId:t SalesOrderId:t DocumentType:t ExternalDocumentNo:t DriveFileId:t ExternalUrl:t FileName:t MimeType:t OrderVersion:i GenerationStatus:t ErrorCode:t CreatedAt:ca CreatedBy:cb" },
  { tab: "SalesOrderFulfillments", table: "sales_order_fulfillments", pk: "fulfillment_id",
    cols: "FulfillmentId:t SalesOrderId:t SalesOrderItemId:t FulfillmentType:t SourceDocumentType:t SourceDocumentId:t SourceLineId:t Quantity:n EffectiveDate:d EvidenceDriveFileId:t ReversesFulfillmentId:t Status:t CommandId:t CreatedAt:ca CreatedBy:cb" },
  { tab: "SalesOrderDocumentLinks", table: "sales_order_document_links", pk: "link_id",
    cols: "LinkId:t SalesOrderId:t SalesOrderItemId:t DocumentType:t DocumentId:t DocumentLineId:t LinkedQty:n LinkStatus:t CommandId:t CreatedAt:ca CreatedBy:cb" },
  { tab: "SalesOrderSequences", table: "sales_order_sequences", pk: "sequence_key",
    cols: "SequenceKey:t Prefix:t BusinessYear:i LastNumber:i UpdatedAt:ua" },
  { tab: "SalesOrderCommands", table: "sales_order_commands", pk: "command_id",
    cols: "CommandId:t PayloadHash:t CommandType:t SalesOrderId:t ResultVersion:i ResultJson:j CommittedAt:ts ActorUserId:t" },
  { tab: "SalesOrderImportMap", table: "sales_order_import_map", pk: "import_key",
    cols: "ImportKey:t SourceSpreadsheetId:t SourceSheetId:t SourceRow=legacy_source_row:i SourceTrackerNo:t SourceHash:t TargetSalesOrderId:t TargetSalesOrderItemId:t ImportBatchId:t ImportStatus:t IssueCodes:t ImportedAt:ts" },

  // ── service reports ────────────────────────────────────────
  { tab: "ServiceReports", table: "service_reports", pk: "service_report_id",
    cols: "ServiceReportId:t ServiceReportNo:t ReportType:t ServiceInvoiceNo:t CompanyId:t CompanyNameSnapshot:t ClientNameSnapshot:t ClientAddressSnapshot:t AssignedTechnicianUserId:t AssignedTechnicianNameSnapshot:t ServiceDate:d ServiceType:t FieldReport:t Remarks:t AcknowledgedByFullName:t AcknowledgedByPosition:t AcknowledgmentTextVersion:t ConsentConfirmed:t SignatureDriveFileId:t SignatureUrl:t SignatureSha256:t SignatureMimeType:t SignatureSize:i SignedAt:ts Status:t Version:i PdfDriveFileId:t PdfUrl:t PdfGenerationStatus:t VoidReason:t CreatedAt:ca CreatedBy:cb UpdatedAt:ua UpdatedBy:ub" },
  { tab: "ServiceReportHistory", table: "service_report_history", pk: "event_id",
    cols: "EventId:t ServiceReportId:t EventType:t FromStatus:t ToStatus:t ChangedFieldsJson=changed_fields_json:j Reason:t CommandId:t ActorUserId:t CreatedAt:ca" },
  { tab: "ServiceReportSequences", table: "service_report_sequences", pk: "sequence_key",
    cols: "SequenceKey:t Prefix:t BusinessYear:i LastNumber:i UpdatedAt:ua" },
  { tab: "ServiceReportCommands", table: "service_report_commands", pk: "command_id",
    cols: "CommandId:t PayloadHash:t CommandType:t ServiceReportId:t ResultVersion:i ResultJson:j CommittedAt:ts ActorUserId:t" },
  // 89 measurement columns kept as text: readings are free-form (units, "OK", ranges).
  { tab: "WaterTreatmentServiceReportDetails", table: "water_treatment_report_details", pk: "service_report_id",
    cols: "ServiceReportId:t EmailAddress:t FeedTdsBefore:t FeedTdsAfter:t PreFilterInletPressureBefore:t PreFilterInletPressureAfter:t Ro1aPureTdsBefore:t Ro1aPureTdsAfter:t Ro1aInletPressureBefore:t Ro1aInletPressureAfter:t Ro1aConcentratePressureBefore:t Ro1aConcentratePressureAfter:t Ro1aPureFlowBefore:t Ro1aPureFlowAfter:t Ro1aConcentrateFlowBefore:t Ro1aConcentrateFlowAfter:t Ro1bPureTdsBefore:t Ro1bPureTdsAfter:t Ro1bInletPressureBefore:t Ro1bInletPressureAfter:t Ro1bConcentratePressureBefore:t Ro1bConcentratePressureAfter:t Ro1bPureFlowBefore:t Ro1bPureFlowAfter:t Ro1bConcentrateFlowBefore:t Ro1bConcentrateFlowAfter:t Ro2PureTdsBefore:t Ro2PureTdsAfter:t Ro2InletPressureBefore:t Ro2InletPressureAfter:t Ro2ConcentratePressureBefore:t Ro2ConcentratePressureAfter:t Ro2PureFlowBefore:t Ro2PureFlowAfter:t Ro2ConcentrateFlowBefore:t Ro2ConcentrateFlowAfter:t StartLoopPressureBefore:t StartLoopPressureAfter:t EndLoopPressureBefore:t EndLoopPressureAfter:t PreMediaPressureBefore:t PreMediaPressureAfter:t PostMediaPressureBefore:t PostMediaPressureAfter:t PostCarbon1PressureBefore:t PostCarbon1PressureAfter:t PostCarbon2PressureBefore:t PostCarbon2PressureAfter:t PostSoftenerPressureBefore:t PostSoftenerPressureAfter:t BrineTankLevelBefore:t BrineTankLevelAfter:t MicrobiologicalWaterSampleResult:t PhysicalChemicalWaterSampleResult:t RawTankStatus:t RawTankLowLevelSensorStatus:t RawTankFloatValveStatus:t RawTankFullRefillStatus:t MultiMediaControlValveStatus:t Carbon1ControlValveStatus:t Carbon2ControlValveStatus:t Softener1ControlValveStatus:t Softener2ControlValveStatus:t RawPumpAStatus:t RawPumpApcStatus:t RawPumpBStatus:t RawPumpBApcStatus:t CipLowLevelSensorStatus:t CipFullRefillStatus:t RoControlPanelTerminalStatus:t FeedControlPanelTerminalStatus:t DistributionControlPanelTerminalStatus:t Ro1PumpStatus:t Ro2PumpStatus:t Ro1MembraneStatus:t Ro2MembraneStatus:t Ro1ProductTankLowLevelSensorStatus:t Ro1ProductTankFullRefillSensorStatus:t Ro2ProductTankLowLevelSensorStatus:t Ro2ProductTankFullRefillSensorStatus:t DistributionPumpStatus:t PressureSensorsStatus:t UvLightStatus:t Remarks:t Recommendation:t CreatedAt:ca CreatedBy:cb UpdatedAt:ua UpdatedBy:ub" },

  // ── purchasing & inventory ────────────────────────────────
  { tab: "PurchaseOrders", table: "purchase_orders", pk: "po_number",
    cols: "PONumber=po_number:t Date=po_date:d SupplierId:t PRNumber=pr_number:t DeliveryDate:d PaymentTerms:t Comments:t PreparedBy:t ApprovedBy:t NotedBy:t TotalAmount:n Status:t DriveFileLink:t ShipToType:t ShipToId:t ShipToName:t ShipToAddress:t ShipToContact:t CreatedAt:ca CreatedBy:cb UpdatedBy:ub UpdatedAt:ua" },
  { tab: "PurchaseOrderItems", table: "purchase_order_items", pk: null,
    cols: "PurchaseOrderId=po_number:t ItemNo:i SupplierProductId:t ProductId:t DescriptionSnapshot:t Quantity:n UnitSnapshot:t CostPerUnitSnapshot:n TotalAmount:n" },
  { tab: "PurchaseOrderStatusHistory", table: "purchase_order_status_history", pk: null,
    cols: "PONumber=po_number:t OldStatus:t NewStatus:t ChangedBy:t ChangedAt:ts" },
  { tab: "PurchaseRequests", table: "purchase_requests", pk: "pr_id", unique: ["pr_no"],
    cols: "PrId:t PrNo:t Status:t SalesOrderId:t SalesOrderNo:t CustomerName:t QuotationNo:t DeliveryAddress:t RequestedByUserId:t RequestedByName:t RequestedDate:d NeededByDate:d Purpose:t CancelReason:t Version:i CreatedAt:ca CreatedBy:cb UpdatedAt:ua UpdatedBy:ub RequestType:t ContractId:t ContractNo:t" },
  { tab: "PurchaseRequestItems", table: "purchase_request_items", pk: "pr_item_id",
    cols: "PrItemId:t PrId:t LineNo=line_no:i ProductId:t ProductCode:t ProductName:t UnitId:t Unit:t Quantity:n SalesOrderItemId:t Remarks:t FromStockQty:n FromStockNote:t FromStockBy:t FromStockAt:ts CancelledQty:n CancelReason:t CancelledBy:t CancelledAt:ts CreatedAt:ca CreatedBy:cb UpdatedAt:ua UpdatedBy:ub ContractItemId:t" },
  { tab: "PurchaseRequestLinks", table: "purchase_request_links", pk: "link_id",
    cols: "LinkId:t PoNumber=po_number:t PoItemNo:i PrId:t PrItemId:t Quantity:n CreatedAt:ca CreatedBy:cb" },
  { tab: "StockMovements", table: "stock_movements", pk: "movement_id",
    cols: "MovementId:t Date=movement_date:d WarehouseId:t ProductId:t Qty:n Type=movement_type:t SourceType:t SourceId:t ReferenceNo:t Note:t Status:t CreatedBy:cb CreatedAt:ca UpdatedBy:ub UpdatedAt:ua" },
  { tab: "StockTransfers", table: "stock_transfers", pk: "transfer_id", unique: ["transfer_no"],
    cols: "TransferId:t TransferNo:t Date=transfer_date:d FromWarehouseId:t ToWarehouseId:t Status:t PreparedBy:t Note:t ApprovedBy:t ApprovedAt:ts ApprovalNote:t CreatedBy:cb CreatedAt:ca UpdatedBy:ub UpdatedAt:ua" },
  { tab: "StockTransferItems", table: "stock_transfer_items", pk: null,
    cols: "TransferId:t ProductId:t Qty:n SerialNumbers:t" },
  { tab: "SafetyStock", table: "safety_stock", pk: null, unique: ["warehouse_id,product_id"],
    cols: "WarehouseId:t ProductId:t Qty:n UpdatedBy:ub UpdatedAt:ua" },

  // ── FTI & liquidation ──────────────────────────────────────
  { tab: "FTIRequests", table: "fti_requests", pk: "control_no",
    cols: "ControlNo:t UserId:t Status:t DateCreated:ca_tm FTIFileLink=fti_file_link:t TotalAmount:n ApprovedByUserId:t ApprovedByName:t ApprovedBySignatureUrl:t ApprovedDate:tm ApprovalComment:t PdfStatus:t PdfRetryAt:ts PdfAttempts:i" },
  { tab: "FTIDetails", table: "fti_details", pk: "detail_id",
    cols: "DetailId:t ControlNo:t Date=detail_date:d Itinerary:t Description:t Kilometer:n FuelPrice:n FuelSubTotal:n TollFee:n" },
  { tab: "FTILegs", table: "fti_legs", pk: "leg_id",
    cols: "LegId:t DetailId:t ControlNo:t OriginName:t OriginAddress:t DestName:t DestAddress:t TollFee:n DistanceKm:n" },
  { tab: "FTISegments", table: "fti_segments", pk: "segment_id",
    cols: "SegmentId:t LegId:t DetailId:t ControlNo:t Group=toll_group:t EntryGate:t ExitGate:t TollFee:n" },
  { tab: "FTIExpenses", table: "fti_expenses", pk: "expense_id",
    cols: "ExpenseId:t DetailId:t MiscellaneousCode:t Amount:n" },
  { tab: "Liquidations", table: "liquidations", pk: "liquidation_id",
    cols: "LiquidationId:t ControlNo:t UserId:t TotalAmount:n Status:t ApprovedByUserId:t ApprovedByName:t ApprovedBySignatureUrl:t ApprovedDate:ts ApprovalComment:t TotalAmountRequested:n CreatedBy:cb CreatedAt:ca UpdatedBy:ub UpdatedAt:ua ReturnDate:d ReturnEvidenceFileId:t ReturnEvidenceName:t ReturnUpdatedBy:t ReturnUpdatedAt:ts" },
  { tab: "ReceiptItems", table: "receipt_items", pk: "receipt_item_id",
    cols: "ReceiptItemId:t LiquidationId:t Date=receipt_date:d Description:t MiscellaneousCode:t Amount:n ReceiptImageUrl:t SINumber=si_number:t SIDate=si_date:d DRNumber=dr_number:t DRDate=dr_date:d CRNumber=cr_number:t CRDate=cr_date:d BSNumber=bs_number:t BSDate=bs_date:d ORNumber=or_number:t ORDate=or_date:d OthersDate:d RefNo:t TIN:t SupplierName:t Address:t CheckNo:t CVNo=cv_no:t Particulars:t GrossAmount:n VAT=vat:n EWT=ewt:n CreatedBy:cb CreatedAt:ca UpdatedBy:ub UpdatedAt:ua" },

  // ── other operations ───────────────────────────────────────
  { tab: "DocumentHandover", table: "document_handovers", pk: "id",
    cols: "Id:t DocumentType:t DocumentNumber:t CustomerName:t TechnicianId:t TechnicianName:t HandedOverBy:t HandedOverByName:t HandedOverAt:ts Status:t ReturnedBy:t ReturnedByName:t ReturnedAt:ts Notes:t AssigneeType:t #15=received_by_after_sales:t #16=received_by_after_sales_name:t #17=received_by_after_sales_at:ts #18=verified_by:t #19=verified_by_name:t #20=verified_at:ts #21=unassigned_by:t #22=unassigned_by_name:t #23=unassigned_at:ts" },
  { tab: "ScheduledCollections", table: "scheduled_collections", pk: "id",
    cols: "Id:t CompanyId:t ScheduledDate:d Notes:t Status:t" },
  { tab: "CollectionHistory", table: "collection_history", pk: "collection_id",
    cols: "CollectionId:t CompanyId:t Description:t AmountCollected:n CollectedDate:d" },
  { tab: "Attendance", table: "attendance", pk: "attendance_id",
    cols: "attendanceId=attendance_id:t userId=user_id:t timestamp=recorded_at:tm type=attendance_type:t location:t" },
  { tab: "FieldWorkLogs", table: "field_work_logs", pk: "work_log_id",
    cols: "workLogId=work_log_id:t userId=user_id:t date=work_date:d customer:t workDescription=work_description:t timeStart=time_start:n timeEnd=time_end:n customerRep=customer_rep:t customerSignature=customer_signature:t location:t createdAt:ca_tm" },
  { tab: "MOA", table: "moa_legacy", pk: null,
    cols: "Customer Name=customer_name:t Date of Agreement=date_of_agreement:d Binding Date=binding_date:d Expiring Date=expiring_date:d Status:t Frequency:t Basis:t Notes:t" },
];

// Relationships, validated after load. Orphaned references are reported, nulled in the
// typed column and preserved in import_raw (owner review), so these hold on every promote.
export const FOREIGN_KEYS = [
  ["users.user_role_id", "user_roles"], ["users.department_id", "departments"], ["users.position_id", "positions"],
  ["user_approvers.requester_user_id", "users"], ["user_approvers.approver_user_id", "users"],
  ["user_fuel_per_km.user_id", "users"],
  ["companies.billing_company_id", "companies"], ["company_contacts.company_id", "companies"],
  ["location_addresses.company_id", "companies"],
  ["products.product_category_id", "product_categories"], ["products.unit_id", "product_units"],
  ["supplier_products.product_id", "products"], ["supplier_products.supplier_id", "companies"],
  ["customer_prices.customer_id", "companies"], ["customer_prices.product_id", "products"],
  ["contracts.company_id", "companies"], ["contract_items.contract_id", "contracts"], ["contract_items.product_id", "products"],
  ["contract_notes.contract_id", "contracts"], ["contract_releases.contract_item_id", "contract_items"],
  ["contract_releases.contract_id", "contracts"], ["contract_period_summary.contract_item_id", "contract_items"],
  ["delivery_receipts.company_id", "companies"], ["delivery_receipts.sales_order_id", "sales_orders"],
  ["delivery_receipts.warehouse_id", "warehouses"],
  ["delivery_receipt_items.dr_number", "delivery_receipts"], ["delivery_receipt_items.product_id", "products"],
  ["delivery_receipt_items.sales_order_item_id", "sales_order_items"],
  ["delivery_receipt_status_history.dr_number", "delivery_receipts"],
  ["service_invoices.customer_id", "companies"], ["service_invoices.contract_id", "contracts"],
  ["service_invoices.dr_number", "delivery_receipts"], ["service_invoices.sales_order_id", "sales_orders"],
  ["service_invoice_items.invoice_no", "service_invoices"],
  ["sales_invoices.customer_id", "companies"], ["sales_invoices.dr_number", "delivery_receipts"],
  ["sales_invoices.sales_order_id", "sales_orders"], ["sales_invoice_items.invoice_no", "sales_invoices"],
  ["quotations.customer_id", "companies"], ["quotation_details.quotation_no", "quotations"],
  ["quotation_notations.quotation_no", "quotations"], ["quotation_history.quotation_no", "quotations"],
  ["sales_orders.customer_id", "companies"], ["sales_order_items.sales_order_id", "sales_orders"],
  ["sales_order_items.product_id", "products"],
  ["sales_order_history.sales_order_id", "sales_orders"], ["sales_order_documents.sales_order_id", "sales_orders"],
  ["sales_order_fulfillments.sales_order_id", "sales_orders"], ["sales_order_fulfillments.sales_order_item_id", "sales_order_items"],
  ["service_reports.company_id", "companies"],
  ["service_report_history.service_report_id", "service_reports"],
  ["water_treatment_report_details.service_report_id", "service_reports"],
  ["purchase_orders.supplier_id", "companies"], ["purchase_order_items.po_number", "purchase_orders"],
  ["purchase_order_items.supplier_product_id", "supplier_products"], ["purchase_order_items.product_id", "products"],
  ["purchase_order_status_history.po_number", "purchase_orders"],
  ["purchase_request_items.pr_id", "purchase_requests"],
  ["stock_movements.warehouse_id", "warehouses"], ["stock_movements.product_id", "products"],
  ["stock_transfer_items.transfer_id", "stock_transfers"],
  ["fti_requests.user_id", "users"], ["fti_details.control_no", "fti_requests"],
  ["fti_legs.detail_id", "fti_details"], ["fti_segments.leg_id", "fti_legs"], ["fti_expenses.detail_id", "fti_details"],
  ["liquidations.user_id", "users"], ["liquidations.control_no", "fti_requests"],
  ["receipt_items.liquidation_id", "liquidations"],
  ["scheduled_collections.company_id", "companies"], ["collection_history.company_id", "companies"],
  ["attendance.user_id", "users"], ["field_work_logs.user_id", "users"],
];

// Indexes for the register list/search paths (plan §4); FK columns are indexed automatically by the generator.
export const INDEXES = [
  "delivery_receipts(delivery_date desc)", "delivery_receipts(status)", "delivery_receipts(sales_order_no)",
  "service_invoices(invoice_date desc)", "service_invoices(status)", "sales_invoices(invoice_date desc)",
  "quotations(created_at desc)", "quotations(status)", "sales_orders(received_date desc)",
  "fti_requests(status)", "liquidations(status)", "document_handovers(document_type, document_number)",
];

// ── helpers shared by generator and importer ────────────────
export function snake(s) {
  return s.replace(/[^A-Za-z0-9]+/g, "_").replace(/([a-z0-9])([A-Z])/g, "$1_$2").replace(/([A-Z]+)([A-Z][a-z])/g, "$1_$2").toLowerCase().replace(/^_|_$/g, "");
}

const AUDIT = { ca: "created_at", cb: "created_by", ua: "updated_at", ub: "updated_by", ca_tm: "created_at", ua_tm: "updated_at" };

/** Parses a table's column spec into [{header, index?, column, type, audit?}]. */
export function parseCols(t) {
  if (!t.cols) return [];
  const tokens = t.cols.match(/(?:[^:\s][^:]*?):[a-z_]+(?=\s|$)/g) || [];
  return tokens.map((tok) => {
    const at = tok.lastIndexOf(":");
    const left = tok.slice(0, at);
    const type = tok.slice(at + 1);
    const [header, rename] = left.split("=");
    const index = header.startsWith("#") ? Number(header.slice(1)) : undefined;
    const column = AUDIT[type] || rename || snake(header);
    const base = type === "ca_tm" || type === "ua_tm" ? "tm" : type === "ca" || type === "ua" ? "ts" : type === "cb" || type === "ub" ? "t" : type;
    return { header: index === undefined ? header : null, index, column, type: base, audit: !!AUDIT[type] };
  });
}

export const SQL_TYPES = { t: "text", i: "integer", n: "numeric", d: "date", b: "boolean", j: "jsonb", ts: "timestamptz", tm: "timestamptz" };

// Tabs deliberately not imported (see docs/superpowers/migration/02-data-inventory.md).
// Credential/template/lock tabs are never read at all (capture-snapshot.mjs EXCLUDED_TABS).
export const SKIPPED_TABS = ["ScheduleCalendar"];
