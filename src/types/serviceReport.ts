/**
 * Service Report — version-one entity model.
 *
 * One active report per Service Invoice. The assigned technician (and admins)
 * edit the draft; a customer representative acknowledges it with consent and a
 * drawn signature. Report numbers are allocated server-side only after a
 * successful acknowledgment.
 */

export type ServiceReportStatus =
  | "DRAFT"
  | "READY_FOR_ACKNOWLEDGMENT"
  | "ACKNOWLEDGED"
  | "PDF_FAILED"
  | "VOID";

export type PdfGenerationStatus = "NONE" | "READY" | "FAILED";

/**
 * Immutable report discriminator, selected at creation. Never changed by PATCH.
 * Blank historical rows resolve to GENERAL (see repository.reportFromRow).
 */
export type ServiceReportType = "GENERAL" | "WATER_TREATMENT";

/**
 * Equipment condition for every field from Raw Tank through UV Light.
 * Exactly WORKING or DEFECTIVE; unanswered optional fields stay blank ("").
 */
export type EquipmentStatus = "" | "WORKING" | "DEFECTIVE";

export function isServiceReportType(value: unknown): value is ServiceReportType {
  return value === "GENERAL" || value === "WATER_TREATMENT";
}

export interface ServiceReport {
  serviceReportId: string;
  /** Immutable type selected at creation. Blank historical values resolve to GENERAL. */
  reportType: ServiceReportType;
  /** Empty until acknowledgment succeeds. Format AIC-SR-YYYY-NNNN. */
  serviceReportNo: string;
  serviceInvoiceNo: string;
  customerId: string;
  companyNameSnapshot: string;
  clientNameSnapshot: string;
  /** Read-only invoice snapshot; a draft-only correction may replace it. */
  clientAddressSnapshot: string;
  /** Server-resolved from the Service Invoice assignment. Never client-supplied. */
  assignedTechnicianUserId: string;
  assignedTechnicianNameSnapshot: string;
  serviceDate: string;
  serviceType: string;
  fieldReport: string;
  remarks: string;
  acknowledgedByFullName: string;
  acknowledgedByPosition: string;
  acknowledgmentTextVersion: string;
  consentConfirmed: boolean;
  signatureDriveFileId: string;
  /** Authorized application URL (Drive proxy), never stored as base64. */
  signatureUrl: string;
  signatureSha256: string;
  signatureMimeType: string;
  signatureSize: number;
  signedAt: string;
  status: ServiceReportStatus;
  /** Optimistic-concurrency counter; incremented by every mutation. */
  version: number;
  pdfDriveFileId: string;
  pdfUrl: string;
  pdfGenerationStatus: PdfGenerationStatus;
  voidReason: string;
  createdAt: string;
  createdBy: string;
  updatedAt: string;
  updatedBy: string;
}

/**
 * One detail row per WATER_TREATMENT report. ServiceReportId is both the
 * primary key and the foreign key to ServiceReports. General reports never
 * create a row in WaterTreatmentServiceReportDetails.
 *
 * Measurement values are nullable trimmed strings in version one (units are not
 * finalized). Blanks stay blank; a real "0" is preserved; values may be any
 * operational text such as N/A or a range.
 *
 * Every "*Status" field accepts exactly WORKING or DEFECTIVE (or blank when the
 * still-unconfirmed required rule allows an unanswered field).
 */
export interface WaterTreatmentServiceReportDetails {
  serviceReportId: string;
  emailAddress: string;
  // ── Water quality and pre-filter ──────────────────────────────────
  feedTdsBefore: string;
  feedTdsAfter: string;
  preFilterInletPressureBefore: string;
  preFilterInletPressureAfter: string;
  // ── RO1A ──────────────────────────────────────────────────────────
  ro1aPureTdsBefore: string;
  ro1aPureTdsAfter: string;
  ro1aInletPressureBefore: string;
  ro1aInletPressureAfter: string;
  ro1aConcentratePressureBefore: string;
  ro1aConcentratePressureAfter: string;
  ro1aPureFlowBefore: string;
  ro1aPureFlowAfter: string;
  ro1aConcentrateFlowBefore: string;
  ro1aConcentrateFlowAfter: string;
  // ── RO1B ──────────────────────────────────────────────────────────
  ro1bPureTdsBefore: string;
  ro1bPureTdsAfter: string;
  ro1bInletPressureBefore: string;
  ro1bInletPressureAfter: string;
  ro1bConcentratePressureBefore: string;
  ro1bConcentratePressureAfter: string;
  ro1bPureFlowBefore: string;
  ro1bPureFlowAfter: string;
  ro1bConcentrateFlowBefore: string;
  ro1bConcentrateFlowAfter: string;
  // ── RO2 ───────────────────────────────────────────────────────────
  ro2PureTdsBefore: string;
  ro2PureTdsAfter: string;
  ro2InletPressureBefore: string;
  ro2InletPressureAfter: string;
  ro2ConcentratePressureBefore: string;
  ro2ConcentratePressureAfter: string;
  ro2PureFlowBefore: string;
  ro2PureFlowAfter: string;
  ro2ConcentrateFlowBefore: string;
  ro2ConcentrateFlowAfter: string;
  // ── Loop, media, carbon, softener, and brine ──────────────────────
  startLoopPressureBefore: string;
  startLoopPressureAfter: string;
  endLoopPressureBefore: string;
  endLoopPressureAfter: string;
  preMediaPressureBefore: string;
  preMediaPressureAfter: string;
  postMediaPressureBefore: string;
  postMediaPressureAfter: string;
  postCarbon1PressureBefore: string;
  postCarbon1PressureAfter: string;
  postCarbon2PressureBefore: string;
  postCarbon2PressureAfter: string;
  postSoftenerPressureBefore: string;
  postSoftenerPressureAfter: string;
  brineTankLevelBefore: string;
  brineTankLevelAfter: string;
  // ── Samples (free text, not Working/Defective selectors) ─────────
  microbiologicalWaterSampleResult: string;
  physicalChemicalWaterSampleResult: string;
  // ── Equipment inspection (Raw Tank … UV Light) ───────────────────
  rawTankStatus: EquipmentStatus;
  rawTankLowLevelSensorStatus: EquipmentStatus;
  rawTankFloatValveStatus: EquipmentStatus;
  rawTankFullRefillStatus: EquipmentStatus;
  multiMediaControlValveStatus: EquipmentStatus;
  carbon1ControlValveStatus: EquipmentStatus;
  carbon2ControlValveStatus: EquipmentStatus;
  softener1ControlValveStatus: EquipmentStatus;
  softener2ControlValveStatus: EquipmentStatus;
  rawPumpAStatus: EquipmentStatus;
  rawPumpApcStatus: EquipmentStatus;
  rawPumpBStatus: EquipmentStatus;
  rawPumpBApcStatus: EquipmentStatus;
  cipLowLevelSensorStatus: EquipmentStatus;
  cipFullRefillStatus: EquipmentStatus;
  roControlPanelTerminalStatus: EquipmentStatus;
  feedControlPanelTerminalStatus: EquipmentStatus;
  distributionControlPanelTerminalStatus: EquipmentStatus;
  ro1PumpStatus: EquipmentStatus;
  ro2PumpStatus: EquipmentStatus;
  ro1MembraneStatus: EquipmentStatus;
  ro2MembraneStatus: EquipmentStatus;
  ro1ProductTankLowLevelSensorStatus: EquipmentStatus;
  ro1ProductTankFullRefillSensorStatus: EquipmentStatus;
  ro2ProductTankLowLevelSensorStatus: EquipmentStatus;
  ro2ProductTankFullRefillSensorStatus: EquipmentStatus;
  distributionPumpStatus: EquipmentStatus;
  pressureSensorsStatus: EquipmentStatus;
  uvLightStatus: EquipmentStatus;
  // ── Findings ──────────────────────────────────────────────────────
  remarks: string;
  recommendation: string;
  createdAt: string;
  createdBy: string;
  updatedAt: string;
  updatedBy: string;
}

export interface ServiceReportHistoryEvent {
  eventId: string;
  serviceReportId: string;
  eventType: string;
  fromStatus: string;
  toStatus: string;
  changedFieldsJson: string;
  reason: string;
  commandId: string;
  actorUserId: string;
  createdAt: string;
}

export interface ServiceReportCommandReceipt {
  commandId: string;
  payloadHash: string;
  commandType: string;
  serviceReportId: string;
  resultVersion: number;
  resultJson: string;
  committedAt: string;
  actorUserId: string;
}

export interface ServiceReportSequence {
  sequenceKey: string;
  prefix: string;
  businessYear: string;
  lastNumber: number;
  updatedAt: string;
}

/** Assigned-technician + report linkage view of a Service Invoices row. */
export interface ServiceInvoiceCoarseRow {
  invoiceNo: string;
  customerId: string;
  companyName: string;
  address: string;
  assignedTechnicianUserId: string;
  assignedTechnicianName: string;
  serviceReportId: string;
  serviceReportStatus: string;
  /** Enriched report type when a report exists (null/"" when none). */
  reportType?: string;
}

/** Client-side user row view for the list page. */
export interface ServiceReportRowView {
  report: ServiceReport;
  invoice: ServiceInvoiceCoarseRow | null;
}