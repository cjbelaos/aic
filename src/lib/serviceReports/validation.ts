// Service Reports — request parsing and runtime validation. Pure module.
// Route handlers stay thin: parsers throw ServiceReportError (400 malformed /
// 422 business) with a fieldErrors map. Never trust client field types.
//
// PATCH is discriminated by the STORED report type: GENERAL requests reject
// Water Treatment payload content (waterTreatmentDetails) and WATER_TREATMENT
// requests reject the General work record (fieldReport). Type changes use the
// dedicated draft-only endpoint rather than a save payload.

import {
  badRequest,
  validationError,
} from "./errors.ts";
import { businessDateYear } from "./ids.ts";
import { EQUIPMENT_STATUSES, SERVICE_REPORT_TYPES } from "./constants.ts";
import {
  waterTreatmentDetailsFromRow,
  WATER_TREATMENT_EQUIPMENT_FIELDS,
  WATER_TREATMENT_MEASUREMENT_SECTIONS,
  WATER_TREATMENT_SAMPLE_FIELDS,
} from "./waterTreatmentDetails.ts";
import type {
  EquipmentStatus,
  ServiceReportType,
  WaterTreatmentServiceReportDetails,
} from "../../types/serviceReport.ts";

export const UUID_PATTERN = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function isUuid(value: unknown): boolean {
  return typeof value === "string" && UUID_PATTERN.test(value);
}

/** Trimmed email with a sane structural check (server-side). */
export function isValidEmail(value: string): boolean {
  if (!value || value.length > 254) return false;
  return EMAIL_PATTERN.test(value);
}

export function parseUuidField(
  value: unknown,
  field: string,
  errors: Record<string, string>,
): string {
  const text = typeof value === "string" ? value.trim() : "";
  if (!text) {
    errors[field] = `${field} is required.`;
    return "";
  }
  if (!isUuid(text)) errors[field] = `${field} must be a UUID.`;
  return text;
}

function optionalString(value: unknown, field: string, errors: Record<string, string>): string {
  if (value === undefined || value === null) return "";
  if (typeof value !== "string") {
    errors[field] = `${field} must be text.`;
    return "";
  }
  return value.trim();
}

function requiredString(value: unknown, field: string, errors: Record<string, string>): string {
  const text = optionalString(value, field, errors);
  if (!text) errors[field] = `${field} is required.`;
  return text;
}

/**
 * Nullable trimmed measurement text for version one. Blanks never become zero;
 * a real "0" is preserved; N/A, ranges and operational remarks are permitted.
 */
function nullableTrimmedString(value: unknown, field: string, errors: Record<string, string>): string {
  return optionalString(value, field, errors);
}

function nonNegativeInteger(value: unknown, field: string, errors: Record<string, string>): number | undefined {
  if (value === undefined || value === null) return undefined;
  const num = typeof value === "number" ? value : Number.parseInt(String(value), 10);
  if (!Number.isInteger(num) || num < 0) {
    errors[field] = `${field} must be a non-negative integer.`;
    return undefined;
  }
  return num;
}

function parseReportTypeField(value: unknown, field: string, errors: Record<string, string>): ServiceReportType {
  const text = typeof value === "string" ? value.trim() : "";
  if (!SERVICE_REPORT_TYPES.includes(text)) {
    errors[field] = "reportType must be GENERAL or WATER_TREATMENT.";
    return "GENERAL";
  }
  return text as ServiceReportType;
}

/**
 * Equipment fields from Raw Tank through UV Light accept exactly WORKING or
 * DEFECTIVE. Blank stays blank; every other nonblank value is rejected.
 */
function parseEquipmentStatusField(value: unknown, field: string, errors: Record<string, string>): EquipmentStatus {
  if (value === undefined || value === null) return "";
  if (typeof value !== "string") {
    errors[field] = `${field} must be WORKING or DEFECTIVE.`;
    return "";
  }
  const trimmed = value.trim();
  if (!trimmed) return "";
  if (!EQUIPMENT_STATUSES.includes(trimmed)) {
    errors[field] = `${field} must be WORKING or DEFECTIVE.`;
    return "";
  }
  return trimmed as EquipmentStatus;
}

export interface ValidatedCreateReport {
  commandId: string;
  invoiceNo: string;
  reportType: ServiceReportType;
  customerId: string;
  assignedTechnicianUserId: string;
}

export function parseCreateReportInput(body: unknown): ValidatedCreateReport {
  if (typeof body !== "object" || body === null) throw badRequest("Request body must be a JSON object.");
  const errors: Record<string, string> = {};
  const value = body as Record<string, unknown>;
  const commandId = parseUuidField(value.commandId, "commandId", errors);
  const invoiceNo = optionalString(value.invoiceNo, "invoiceNo", errors);
  const reportType = parseReportTypeField(value.reportType, "reportType", errors);
  const customerId = optionalString(value.customerId, "customerId", errors);
  const assignedTechnicianUserId = optionalString(value.assignedTechnicianUserId, "assignedTechnicianUserId", errors);
  if (!invoiceNo) {
    if (!customerId) errors.customerId = "Select a customer for a standalone Service Report.";
    if (!assignedTechnicianUserId) errors.assignedTechnicianUserId = "Select the technician attending this standalone Service Report.";
  }
  if (Object.keys(errors).length > 0) throw badRequest("Invalid create-report payload.", errors);
  return { commandId, invoiceNo, reportType, customerId, assignedTechnicianUserId };
}

export interface ValidatedGeneralSaveDraft {
  commandId: string;
  expectedVersion: number;
  serviceDate: string;
  serviceType: string;
  fieldReport: string;
  remarks: string;
  clientAddress: string;
}

export function parseGeneralSaveDraftInput(body: unknown): ValidatedGeneralSaveDraft {
  if (typeof body !== "object" || body === null) throw badRequest("Request body must be a JSON object.");
  const errors: Record<string, string> = {};
  const value = body as Record<string, unknown>;
  // Discriminated payload guard: a General report never accepts Water Treatment content.
  if (Object.prototype.hasOwnProperty.call(value, "waterTreatmentDetails")) {
    errors.waterTreatmentDetails = "waterTreatmentDetails is not allowed on a General Service Report.";
  }
  if (Object.prototype.hasOwnProperty.call(value, "reportType")) {
    errors.reportType = "reportType is immutable and cannot be changed.";
  }
  const commandId = parseUuidField(value.commandId, "commandId", errors);
  const expectedVersion = nonNegativeInteger(value.expectedVersion, "expectedVersion", errors);
  const serviceDate = requiredString(value.serviceDate, "serviceDate", errors);
  if (serviceDate) {
    try {
      businessDateYear(serviceDate);
    } catch {
      errors.serviceDate = "serviceDate must be a valid ISO date (YYYY-MM-DD).";
    }
  }
  const serviceType = requiredString(value.serviceType, "serviceType", errors);
  const fieldReport = requiredString(value.fieldReport, "fieldReport", errors);
  const remarks = optionalString(value.remarks, "remarks", errors);
  const clientAddress = optionalString(value.clientAddress, "clientAddress", errors);
  if (Object.keys(errors).length > 0) throw validationError("Draft validation failed.", errors);
  return {
    commandId,
    expectedVersion: expectedVersion ?? 0,
    serviceDate,
    serviceType,
    fieldReport,
    remarks,
    clientAddress,
  };
}
export interface ValidatedWaterTreatmentDraft {
  commandId: string;
  expectedVersion: number;
  serviceDate: string;
  serviceType: string;
  /** Client name is user-entered (prefilled from the invoice) and editable. */
  clientName: string;
  /** Client address is user-entered (prefilled from the invoice) and editable. */
  clientAddress: string;
  /** All technician-entered Water Treatment fields keyed by sheet property. */
  waterTreatmentDetails: WaterTreatmentServiceReportDetails;
}

export function parseWaterTreatmentSaveDraftInput(body: unknown): ValidatedWaterTreatmentDraft {
  if (typeof body !== "object" || body === null) throw badRequest("Request body must be a JSON object.");
  const errors: Record<string, string> = {};
  const value = body as Record<string, unknown>;
  // A Water Treatment report never records the General FieldReport as its work record.
  if (Object.prototype.hasOwnProperty.call(value, "fieldReport")) {
    errors.fieldReport = "fieldReport is not used on a Water Treatment System Service Report.";
  }
  if (Object.prototype.hasOwnProperty.call(value, "reportType")) {
    errors.reportType = "reportType is immutable and cannot be changed.";
  }

  const commandId = parseUuidField(value.commandId, "commandId", errors);
  const expectedVersion = nonNegativeInteger(value.expectedVersion, "expectedVersion", errors);
  const serviceDate = requiredString(value.serviceDate, "serviceDate", errors);
  if (serviceDate) {
    try {
      businessDateYear(serviceDate);
    } catch {
      errors.serviceDate = "serviceDate must be a valid ISO date (YYYY-MM-DD).";
    }
  }
  const serviceType = requiredString(value.serviceType, "serviceType", errors);
  const clientName = requiredString(value.clientName, "clientName", errors);
  const clientAddress = optionalString(value.clientAddress, "clientAddress", errors);

  let details = waterTreatmentDetailsFromRow([]);
  const rawDetails = value.waterTreatmentDetails;
  if (rawDetails === undefined || rawDetails === null) {
    errors.waterTreatmentDetails = "The waterTreatmentDetails payload is required for a Water Treatment System report.";
  } else if (typeof rawDetails !== "object" || Array.isArray(rawDetails)) {
    errors.waterTreatmentDetails = "waterTreatmentDetails must be an object.";
  } else {
    const src = rawDetails as Record<string, unknown>;
    const emailAddress = nullableTrimmedString(src.emailAddress, "emailAddress", errors);
    if (emailAddress && !isValidEmail(emailAddress)) {
      errors.emailAddress = "Enter a valid email address.";
    }
    details = { ...waterTreatmentDetailsFromRow([]), emailAddress };
    const target = details as unknown as Record<string, string | EquipmentStatus>;
    for (const section of WATER_TREATMENT_MEASUREMENT_SECTIONS) {
      for (const field of section.fields) {
        target[field.beforeKey] = nullableTrimmedString(src[field.beforeKey], field.beforeKey, errors);
        target[field.afterKey] = nullableTrimmedString(src[field.afterKey], field.afterKey, errors);
      }
    }
    // Free-text water-sample answers (NEVER Working/Defective selectors).
    for (const sample of WATER_TREATMENT_SAMPLE_FIELDS) {
      target[sample.key] = nullableTrimmedString(src[sample.key], sample.key, errors);
    }
    // Equipment inspection: exactly WORKING or DEFECTIVE (or blank when unanswered).
    for (const equipment of WATER_TREATMENT_EQUIPMENT_FIELDS) {
      target[equipment.key] = parseEquipmentStatusField(src[equipment.key], equipment.key, errors);
    }
    details.remarks = nullableTrimmedString(src.remarks, "remarks", errors);
    details.recommendation = nullableTrimmedString(src.recommendation, "recommendation", errors);
  }

  if (Object.keys(errors).length > 0) throw validationError("Draft validation failed.", errors);
  return {
    commandId,
    expectedVersion: expectedVersion ?? 0,
    serviceDate,
    serviceType,
    clientName,
    clientAddress,
    waterTreatmentDetails: details,
  };
}

export type ValidatedSaveDraft =
  | { reportType: "GENERAL"; general: ValidatedGeneralSaveDraft }
  | { reportType: "WATER_TREATMENT"; waterTreatment: ValidatedWaterTreatmentDraft };

/** Discriminates the PATCH body against the STORED report type. */
export function parseSaveDraftInput(body: unknown, reportType: ServiceReportType): ValidatedSaveDraft {
  if (reportType === "WATER_TREATMENT") {
    return { reportType: "WATER_TREATMENT", waterTreatment: parseWaterTreatmentSaveDraftInput(body) };
  }
  return { reportType: "GENERAL", general: parseGeneralSaveDraftInput(body) };
}
export interface ValidatedExpectedVersionInput {
  commandId: string;
  expectedVersion: number;
}

export function parseExpectedVersionInput(body: unknown): ValidatedExpectedVersionInput {
  if (typeof body !== "object" || body === null) throw badRequest("Request body must be a JSON object.");
  const errors: Record<string, string> = {};
  const value = body as Record<string, unknown>;
  const commandId = parseUuidField(value.commandId, "commandId", errors);
  const expectedVersion = nonNegativeInteger(value.expectedVersion, "expectedVersion", errors);
  if (Object.keys(errors).length > 0) throw badRequest("Invalid payload.", errors);
  return { commandId, expectedVersion: expectedVersion ?? 0 };
}

export interface ValidatedAcknowledge {
  commandId: string;
  expectedVersion: number;
  acknowledgedByFullName: string;
  acknowledgedByPosition: string;
  consentConfirmed: boolean;
  signaturePng: Buffer;
}

/**
 * Parses the multipart acknowledgment form. The customer representative enters
 * their full name and optional position; the consent checkbox must be checked;
 * the signature must be an attached PNG file (never a path or remote URL).
 */
export async function parseAcknowledgeMultipart(formData: FormData): Promise<ValidatedAcknowledge> {
  const errors: Record<string, string> = {};
  const commandId = parseUuidField(formData.get("commandId"), "commandId", errors);
  const expectedVersionRaw = formData.get("expectedVersion");
  const expectedVersion = nonNegativeInteger(
    expectedVersionRaw === null ? undefined : expectedVersionRaw,
    "expectedVersion",
    errors,
  ) ?? 0;
  const rawName = formData.get("acknowledgedByFullName");
  const acknowledgedByFullName = typeof rawName === "string" ? rawName.trim() : "";
  if (!acknowledgedByFullName) {
    errors.acknowledgedByFullName = "The customer representative full name is required (\u201cAcknowledged by\u201d).";
  }
  const rawPosition = formData.get("acknowledgedByPosition");
  const acknowledgedByPosition = typeof rawPosition === "string" ? rawPosition.trim() : "";

  const consent = String(formData.get("consentConfirmed") ?? "").trim().toLowerCase();
  const consentConfirmed = consent === "true" || consent === "on" || consent === "yes" || consent === "1";
  if (!consentConfirmed) {
    errors.consentConfirmed = "The acknowledgment statement must be checked before the report can be acknowledged.";
  }

  const file = formData.get("signature");
  let signaturePng: Buffer = Buffer.alloc(0);
  if (file instanceof File) {
    signaturePng = Buffer.from(await file.arrayBuffer());
  } else {
    errors.signature = "A signature image is required.";
  }
  if (Object.keys(errors).length > 0) throw validationError("Acknowledgment validation failed.", errors);
  return {
    commandId,
    expectedVersion,
    acknowledgedByFullName,
    acknowledgedByPosition,
    consentConfirmed,
    signaturePng,
  };
}

export interface ValidatedVoidReport {
  commandId: string;
  expectedVersion: number;
  reason: string;
}

export function parseVoidReportInput(body: unknown): ValidatedVoidReport {
  if (typeof body !== "object" || body === null) throw badRequest("Request body must be a JSON object.");
  const errors: Record<string, string> = {};
  const value = body as Record<string, unknown>;
  const commandId = parseUuidField(value.commandId, "commandId", errors);
  const expectedVersion = nonNegativeInteger(value.expectedVersion, "expectedVersion", errors);
  const reason = typeof value.reason === "string" && value.reason.trim() ? value.reason.trim() : "";
  if (!reason) errors.reason = "A void reason is required.";
  if (Object.keys(errors).length > 0) throw validationError("Void validation failed.", errors);
  return { commandId, expectedVersion: expectedVersion ?? 0, reason };
}

/** Parsed input for the dedicated draft-only report-type change operation. */
export interface ValidatedChangeReportTypeInput {
  commandId: string;
  expectedVersion: number;
  reportType: ServiceReportType;
}

export function parseChangeReportTypeInput(body: unknown): ValidatedChangeReportTypeInput {
  if (typeof body !== "object" || body === null) throw badRequest("Request body must be a JSON object.");
  const errors: Record<string, string> = {};
  const value = body as Record<string, unknown>;
  const commandId = parseUuidField(value.commandId, "commandId", errors);
  const expectedVersion = nonNegativeInteger(value.expectedVersion, "expectedVersion", errors);
  const reportType = parseReportTypeField(value.reportType, "reportType", errors);
  if (Object.keys(errors).length > 0) throw badRequest("Invalid change-report-type payload.", errors);
  return { commandId, expectedVersion: expectedVersion ?? 0, reportType };
}
