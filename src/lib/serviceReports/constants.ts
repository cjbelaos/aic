// Service Reports — tab names, header contracts and shared literals.
// The header arrays are the provisioning contract: the schema verification
// script (scripts/verify-service-report-schema.mjs) and the live repository
// both read them from here.

export const SERVICE_REPORTS_TAB = "ServiceReports";
export const WATER_TREATMENT_DETAILS_TAB = "WaterTreatmentServiceReportDetails";
export const SERVICE_REPORTS_HISTORY_TAB = "ServiceReportHistory";
export const SERVICE_REPORTS_SEQUENCES_TAB = "ServiceReportSequences";
export const SERVICE_REPORTS_COMMANDS_TAB = "ServiceReportCommands";

export const SERVICE_INVOICES_TAB = "ServiceInvoices";
/** Appended columns for ServiceInvoices (O..R). Never shift existing columns. */
export const SERVICE_INVOICES_APPENDED_HEADERS: readonly string[] = [
  "AssignedTechnicianUserId",
  "AssignedTechnicianName",
  "ServiceReportId",
  "ServiceReportStatus",
];

// Canonical ServiceReports schema (34 columns, A:AH) in this exact order. The
// live sheet was reordered by hand to match this order; it is now the contract
// for the row mappers (./reportRow) and for the read-only provisioning verifier
// (scripts/verify-service-report-schema.mjs). Never reorder or rename a column.
//
// ReportType lives in column C and is immutable after creation. SignatureMimeType
// and SignatureSize are dedicated columns so the acknowledgment requirement
// "store Drive ID, URL, hash, MIME type, size, and timestamp" is satisfied by
// real columns.
//
// The domain model keeps the field name `ServiceReport.customerId`; it is
// persisted in the `CompanyId` column (E).
export const SERVICE_REPORTS_HEADERS: readonly string[] = [
  "ServiceReportId", // A
  "ServiceReportNo", // B
  "ReportType", // C
  "ServiceInvoiceNo", // D
  "CompanyId", // E — domain field: customerId
  "CompanyNameSnapshot", // F
  "ClientNameSnapshot", // G
  "ClientAddressSnapshot", // H
  "AssignedTechnicianUserId", // I
  "AssignedTechnicianNameSnapshot", // J
  "ServiceDate", // K
  "ServiceType", // L
  "FieldReport", // M
  "Remarks", // N
  "AcknowledgedByFullName", // O
  "AcknowledgedByPosition", // P
  "AcknowledgmentTextVersion", // Q
  "ConsentConfirmed", // R
  "SignatureDriveFileId", // S
  "SignatureUrl", // T
  "SignatureSha256", // U
  "SignatureMimeType", // V
  "SignatureSize", // W
  "SignedAt", // X
  "Status", // Y
  "Version", // Z
  "PdfDriveFileId", // AA
  "PdfUrl", // AB
  "PdfGenerationStatus", // AC
  "VoidReason", // AD
  "CreatedAt", // AE
  "CreatedBy", // AF
  "UpdatedAt", // AG
  "UpdatedBy", // AH
] as const;

/**
 * Exact provisioning contract for WaterTreatmentServiceReportDetails (89
 * columns). ServiceReportId is both primary key and foreign key to
 * ServiceReports. Future fields go at the end; never reorder existing columns.
 * Do not use a JSON catch-all column.
 */
export const WATER_TREATMENT_DETAILS_HEADERS: readonly string[] = [
  "ServiceReportId",
  "EmailAddress",
  "FeedTdsBefore",
  "FeedTdsAfter",
  "PreFilterInletPressureBefore",
  "PreFilterInletPressureAfter",
  "Ro1aPureTdsBefore",
  "Ro1aPureTdsAfter",
  "Ro1aInletPressureBefore",
  "Ro1aInletPressureAfter",
  "Ro1aConcentratePressureBefore",
  "Ro1aConcentratePressureAfter",
  "Ro1aPureFlowBefore",
  "Ro1aPureFlowAfter",
  "Ro1aConcentrateFlowBefore",
  "Ro1aConcentrateFlowAfter",
  "Ro1bPureTdsBefore",
  "Ro1bPureTdsAfter",
  "Ro1bInletPressureBefore",
  "Ro1bInletPressureAfter",
  "Ro1bConcentratePressureBefore",
  "Ro1bConcentratePressureAfter",
  "Ro1bPureFlowBefore",
  "Ro1bPureFlowAfter",
  "Ro1bConcentrateFlowBefore",
  "Ro1bConcentrateFlowAfter",
  "Ro2PureTdsBefore",
  "Ro2PureTdsAfter",
  "Ro2InletPressureBefore",
  "Ro2InletPressureAfter",
  "Ro2ConcentratePressureBefore",
  "Ro2ConcentratePressureAfter",
  "Ro2PureFlowBefore",
  "Ro2PureFlowAfter",
  "Ro2ConcentrateFlowBefore",
  "Ro2ConcentrateFlowAfter",
  "StartLoopPressureBefore",
  "StartLoopPressureAfter",
  "EndLoopPressureBefore",
  "EndLoopPressureAfter",
  "PreMediaPressureBefore",
  "PreMediaPressureAfter",
  "PostMediaPressureBefore",
  "PostMediaPressureAfter",
  "PostCarbon1PressureBefore",
  "PostCarbon1PressureAfter",
  "PostCarbon2PressureBefore",
  "PostCarbon2PressureAfter",
  "PostSoftenerPressureBefore",
  "PostSoftenerPressureAfter",
  "BrineTankLevelBefore",
  "BrineTankLevelAfter",
  "MicrobiologicalWaterSampleResult",
  "PhysicalChemicalWaterSampleResult",
  "RawTankStatus",
  "RawTankLowLevelSensorStatus",
  "RawTankFloatValveStatus",
  "RawTankFullRefillStatus",
  "MultiMediaControlValveStatus",
  "Carbon1ControlValveStatus",
  "Carbon2ControlValveStatus",
  "Softener1ControlValveStatus",
  "Softener2ControlValveStatus",
  "RawPumpAStatus",
  "RawPumpApcStatus",
  "RawPumpBStatus",
  "RawPumpBApcStatus",
  "CipLowLevelSensorStatus",
  "CipFullRefillStatus",
  "RoControlPanelTerminalStatus",
  "FeedControlPanelTerminalStatus",
  "DistributionControlPanelTerminalStatus",
  "Ro1PumpStatus",
  "Ro2PumpStatus",
  "Ro1MembraneStatus",
  "Ro2MembraneStatus",
  "Ro1ProductTankLowLevelSensorStatus",
  "Ro1ProductTankFullRefillSensorStatus",
  "Ro2ProductTankLowLevelSensorStatus",
  "Ro2ProductTankFullRefillSensorStatus",
  "DistributionPumpStatus",
  "PressureSensorsStatus",
  "UvLightStatus",
  "Remarks",
  "Recommendation",
  "CreatedAt",
  "CreatedBy",
  "UpdatedAt",
  "UpdatedBy",
] as const;

export const SERVICE_REPORTS_HISTORY_HEADERS: readonly string[] = [
  "EventId",
  "ServiceReportId",
  "EventType",
  "FromStatus",
  "ToStatus",
  "ChangedFieldsJson",
  "Reason",
  "CommandId",
  "ActorUserId",
  "CreatedAt",
];

export const SERVICE_REPORTS_SEQUENCES_HEADERS: readonly string[] = [
  "SequenceKey",
  "Prefix",
  "BusinessYear",
  "LastNumber",
  "UpdatedAt",
];

export const SERVICE_REPORTS_COMMANDS_HEADERS: readonly string[] = [
  "CommandId",
  "PayloadHash",
  "CommandType",
  "ServiceReportId",
  "ResultVersion",
  "ResultJson",
  "CommittedAt",
  "ActorUserId",
];

export const SERVICE_REPORT_NUMBER_PREFIX = "AIC-SR";

/** Version identifier for the acknowledgment statement text. */
export const ACKNOWLEDGMENT_TEXT_VERSION = "v1";

/** Exact statement shown above the checkbox and signature canvas. */
export const ACKNOWLEDGMENT_TEXT =
  "I acknowledge that the service described in this report was performed and that I had the opportunity to review the field report and remarks.";

export const OPEN_REPORT_EDITABLE_STATUSES: readonly string[] = ["DRAFT"];

/** Immutable report types. Blank historical values resolve to GENERAL. */
export const SERVICE_REPORT_TYPES: readonly string[] = ["GENERAL", "WATER_TREATMENT"];

/** Equipment choices for every field from Raw Tank through UV Light. */
export const EQUIPMENT_STATUSES: readonly string[] = ["WORKING", "DEFECTIVE"];

/** CVS: expected row widths for the ServiceReports row mappers. */
export const SERVICE_REPORTS_ROW_WIDTH = 34;
export const WATER_TREATMENT_DETAILS_ROW_WIDTH = 89;
export const SERVICE_REPORTS_HISTORY_ROW_WIDTH = 10;
export const SERVICE_REPORTS_SEQUENCES_ROW_WIDTH = 5;
export const SERVICE_REPORTS_COMMANDS_ROW_WIDTH = 8;

/** Drive folder env var for private Service Report artifacts. */
export const SERVICE_REPORTS_DRIVE_FOLDER_ENV = "GOOGLE_DRIVE_SERVICE_REPORTS_FOLDER_ID";

export const SERVICE_REPORT_MIME_PNG = "image/png";
export const SERVICE_REPORT_MIME_PDF = "application/pdf";