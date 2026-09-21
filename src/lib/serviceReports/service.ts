// Service Reports — server-side orchestration. Routes stay thin and call the
// exported functions in this module. The server owns the actor, timestamps,
// authorization, transitions, report-number allocation, signature/PDF Drive
// writes (with compensation), history and idempotency receipts. Persistence
// goes through injectable ServiceReportStore / ServiceReportDrive ports, so
// this module is exercised by native-TypeScript tests against in-memory fakes.

import type {
  ServiceReport,
  ServiceReportHistoryEvent,
  ServiceInvoiceCoarseRow,
  ServiceReportType,
  WaterTreatmentServiceReportDetails,
} from "../../types/serviceReport.ts";
import { ACKNOWLEDGMENT_TEXT_VERSION } from "./constants.ts";
import { buildReceipt, requestIntentHash, sha256HexBuffer } from "./commands.ts";
import { analyseSignaturePng, canTransition, verifyMeaningfulSignature } from "./domain.ts";
import { businessDateYear, manilaBusinessDate, newUuid, nowIso } from "./ids.ts";
import { commandReplay, duplicate, forbidden, notFound, validationError } from "./errors.ts";
import { canAccessReport, canAdministerReport, canModifyReport } from "./permissions.ts";
import type { ReportActor } from "./permissions.ts";
import type {
  ServiceReportStore,
  ServiceReportDrive,
  ServiceReportPdfRenderer,
  ReportAllowedActions,
} from "./storeTypes.ts";
import { allowedActionsFor } from "./storeTypes.ts";
import { emptyWaterTreatmentDetails, waterTreatmentPdfFileName } from "./waterTreatmentDetails.ts";

export type Actor = ReportActor;

export interface ReportWithInvoice {
  report: ServiceReport;
  invoice: ServiceInvoiceCoarseRow | null;
}

export interface ReportDetail extends ReportWithInvoice {
  history: ServiceReportHistoryEvent[];
  allowedActions: ReportAllowedActions;
  isAdmin: boolean;
  /** Present only for WATER_TREATMENT reports; null for GENERAL. */
  waterTreatmentDetails: WaterTreatmentServiceReportDetails | null;
}

export interface CreateReportInput {
  commandId: string;
  invoiceNo: string;
  reportType: ServiceReportType;
}

export interface GeneralSaveDraftFields {
  commandId: string;
  expectedVersion: number;
  serviceDate: string;
  serviceType: string;
  fieldReport: string;
  remarks: string;
  /** Optional draft-only site correction; ignored once the report is locked. */
  clientAddress: string;
}

export interface WaterTreatmentSaveDraftFields {
  commandId: string;
  expectedVersion: number;
  serviceDate: string;
  serviceType: string;
  /** User-entered client name (prefilled from the invoice; never back-written). */
  clientName: string;
  /** User-entered client address (prefilled from the invoice; never back-written). */
  clientAddress: string;
  /** Technician-entered Water Treatment fields. */
  details: WaterTreatmentServiceReportDetails;
}

/** PATCH payload discriminated by the STORED report type. */
export type SaveDraftInput =
  | { reportType: "GENERAL"; general: GeneralSaveDraftFields }
  | { reportType: "WATER_TREATMENT"; waterTreatment: WaterTreatmentSaveDraftFields };

export interface ExpectedVersionInput {
  commandId: string;
  expectedVersion: number;
}

/** A report type can be corrected only while the report is still a draft. */
export interface ChangeReportTypeInput extends ExpectedVersionInput {
  reportType: ServiceReportType;
}

export interface AcknowledgeInput {
  commandId: string;
  expectedVersion: number;
  acknowledgedByFullName: string;
  acknowledgedByPosition: string;
  consentConfirmed: boolean;
  signaturePng: Buffer;
}

export interface AcknowledgeResult {
  report: ServiceReport;
  pdfReady: boolean;
  pdfWarning?: string;
  reused: boolean;
}

export interface PdfRetryInput {
  commandId: string;
  expectedVersion: number;
}

export interface VoidInput {
  commandId: string;
  expectedVersion: number;
  reason: string;
}

export interface ServiceReportServiceOptions {
  /** Server-side A4 PDF renderer (injected; absent in focused unit tests). */
  pdfRenderer?: ServiceReportPdfRenderer;
  /** Injectable clock for deterministic tests. */
  now?: () => Date;
}

export interface OperationContext {
  store: ServiceReportStore;
  drive: ServiceReportDrive;
  options: ServiceReportServiceOptions;
}

export function createOperationContext(
  store: ServiceReportStore,
  drive: ServiceReportDrive,
  options: ServiceReportServiceOptions = {},
): OperationContext {
  return { store, drive, options };
}

function nowFor(ctx: OperationContext): string {
  const now = ctx.options.now ? ctx.options.now() : new Date();
  return nowIso(now);
}

function assertFound(report: ServiceReport | null, id: string): asserts report is ServiceReport {
  if (!report) throw notFound(`Service Report ${id} was not found.`);
}

function historyEvent(input: {
  report: ServiceReport;
  eventType: string;
  fromStatus: string;
  toStatus: string;
  changedFields?: Record<string, unknown>;
  reason?: string;
  commandId: string;
  actor: Actor;
  createdAt: string;
}): ServiceReportHistoryEvent {
  return {
    eventId: newUuid(),
    serviceReportId: input.report.serviceReportId,
    eventType: input.eventType,
    fromStatus: input.fromStatus,
    toStatus: input.toStatus,
    changedFieldsJson: JSON.stringify(input.changedFields ?? {}),
    reason: input.reason ?? "",
    commandId: input.commandId,
    actorUserId: input.actor.userId,
    createdAt: input.createdAt,
  };
}

async function invoiceForReport(
  store: ServiceReportStore,
  report: ServiceReport,
): Promise<ServiceInvoiceCoarseRow | null> {
  const invoices = await store.listInvoices();
  return invoices.find((i) => i.invoiceNo.trim().toLowerCase() === report.serviceInvoiceNo.trim().toLowerCase()) ?? null;
}

/**
 * Wraps a mutation with an idempotency receipt. Replays the stored result when
 * the same commandId is retried and refuses to re-use a commandId for a
 * different intent.
 */
async function runWithReceipt<T>(ctx: OperationContext, opts: {
  commandId: string;
  commandType: string;
  reportId: string | null;
  operation: string;
  input: unknown;
  actor: Actor;
  execute: () => Promise<{ version: number; result: T }>;
}): Promise<T> {
  const intentHash = requestIntentHash(opts.operation, opts.actor.userId, opts.reportId, opts.input);
  const commands = await ctx.store.listCommands();
  const existing = commands.find((c) => c.commandId === opts.commandId);
  if (existing) {
    if (existing.payloadHash === intentHash) return JSON.parse(existing.resultJson) as T;
    throw commandReplay("This commandId was already used for a different request.");
  }
  const outcome = await opts.execute();
  await ctx.store.saveCommand(buildReceipt({
    commandId: opts.commandId,
    commandType: opts.commandType,
    serviceReportId: opts.reportId ?? "",
    resultVersion: outcome.version,
    result: outcome.result,
    committedAt: nowFor(ctx),
    actorUserId: opts.actor.userId,
    payloadHash: intentHash,
  }));
  return outcome.result;
}

// ── Reads ─────────────────────────────────────────────────────────

export async function listReportsForActor(
  ctx: OperationContext,
  actor: Actor,
): Promise<ReportWithInvoice[]> {
  const reports = await ctx.store.listReports();
  const invoices = await ctx.store.listInvoices();
  const rows: ReportWithInvoice[] = [];
  for (const report of reports) {
    const invoice = invoices.find((i) => i.invoiceNo === report.serviceInvoiceNo) ?? null;
    const decision = canAccessReport(actor, report, invoice);
    if (!decision.allowed) continue;
    rows.push({ report, invoice });
  }
  rows.sort((a, b) => b.report.updatedAt.localeCompare(a.report.updatedAt));
  return rows;
}

export async function getReportDetail(
  ctx: OperationContext,
  actor: Actor,
  reportId: string,
): Promise<ReportDetail> {
  const report = await ctx.store.getReport(reportId);
  assertFound(report, reportId);
  const invoice = await invoiceForReport(ctx.store, report);
  const decision = canAccessReport(actor, report, invoice);
  if (!decision.allowed) throw forbidden(decision.reason ?? "Forbidden.");
  const history = await ctx.store.listHistory(reportId);
  const isAdmin = canAdministerReport(actor).allowed;
  const waterTreatmentDetails = report.reportType === "WATER_TREATMENT"
    ? await ctx.store.getWaterTreatmentDetails(reportId)
    : null;
  return {
    report,
    invoice,
    history: history.slice(-80),
    allowedActions: allowedActionsFor(report, isAdmin),
    isAdmin,
    waterTreatmentDetails,
  };
}

export interface ReportOptionsResult {
  invoices: ServiceInvoiceCoarseRow[];
}

export async function getReportOptions(
  ctx: OperationContext,
  actor: Actor,
): Promise<ReportOptionsResult> {
  const invoices = await ctx.store.listInvoices();
  return { invoices: invoices.filter((invoice) => canAccessReport(actor, null, invoice).allowed) };
}

export async function getReportHistory(
  ctx: OperationContext,
  actor: Actor,
  reportId: string,
): Promise<ServiceReportHistoryEvent[]> {
  const report = await ctx.store.getReport(reportId);
  assertFound(report, reportId);
  const invoice = await invoiceForReport(ctx.store, report);
  const decision = canAccessReport(actor, report, invoice);
  if (!decision.allowed) throw forbidden(decision.reason ?? "Forbidden.");
  return (await ctx.store.listHistory(reportId)).slice(-80);
}

// ── Create / open ─────────────────────────────────────────────────

export async function createOrOpenReport(
  ctx: OperationContext,
  actor: Actor,
  input: CreateReportInput,
): Promise<ReportWithInvoice & { reusedExisting: boolean }> {
  return runWithReceipt(ctx, {
    commandId: input.commandId,
    commandType: "sr.create",
    reportId: null,
    operation: "createOrOpenReport",
    input: { invoiceNo: input.invoiceNo, reportType: input.reportType },
    actor,
    execute: async () => {
      const invoices = await ctx.store.listInvoices();
      const invoice = invoices.find((i) => i.invoiceNo.trim().toLowerCase() === input.invoiceNo.trim().toLowerCase());
      if (!invoice) throw notFound(`Service Invoice "${input.invoiceNo}" was not found.`);
      if (!invoice.assignedTechnicianUserId || !invoice.assignedTechnicianName) {
        throw validationError("Assign a technician before creating a Service Report.", {
          assignedTechnicianUserId: "Assign a technician before creating a Service Report.",
        });
      }
      const decision = canAccessReport(actor, null, invoice);
      if (!decision.allowed) throw forbidden(decision.reason ?? "Forbidden.");

      const existing = await ctx.store.findReportByInvoiceNo(invoice.invoiceNo);
      if (existing) {
        if (existing.reportType !== input.reportType) {
          throw typeConflictFor(existing.reportType, existing);
        }
        return {
          version: existing.version,
          result: { report: existing, invoice, reusedExisting: true },
        };
      }

      const now = nowFor(ctx);
      const report: ServiceReport = {
        serviceReportId: newUuid(),
        reportType: input.reportType,
        serviceReportNo: "",
        serviceInvoiceNo: invoice.invoiceNo,
        customerId: invoice.customerId,
        companyNameSnapshot: invoice.companyName,
        clientNameSnapshot: invoice.companyName,
        clientAddressSnapshot: invoice.address,
        assignedTechnicianUserId: invoice.assignedTechnicianUserId,
        assignedTechnicianNameSnapshot: invoice.assignedTechnicianName,
        serviceDate: manilaBusinessDate(),
        serviceType: "",
        fieldReport: "",
        remarks: "",
        acknowledgedByFullName: "",
        acknowledgedByPosition: "",
        acknowledgmentTextVersion: "",
        consentConfirmed: false,
        signatureDriveFileId: "",
        signatureUrl: "",
        signatureSha256: "",
        signatureMimeType: "",
        signatureSize: 0,
        signedAt: "",
        status: "DRAFT",
        version: 1,
        pdfDriveFileId: "",
        pdfUrl: "",
        pdfGenerationStatus: "NONE",
        voidReason: "",
        createdAt: now,
        createdBy: actor.userId,
        updatedAt: now,
        updatedBy: actor.userId,
      };
      await ctx.store.createReport(report); // throws DUPLICATE when an active report exists
      try {
        // A WATER_TREATMENT report always carries exactly one detail row. If the
        // detail write fails, the freshly-created parent row is removed so no
        // apparently-valid WATER_TREATMENT parent is left without its details.
        if (report.reportType === "WATER_TREATMENT") {
          await ctx.store.createWaterTreatmentDetails(
            emptyWaterTreatmentDetails(report.serviceReportId, actor.userId, now),
          );
        }
      } catch (error) {
        try {
          await ctx.store.deleteReport(report.serviceReportId);
        } catch (compensationError) {
          throw error; // do not mask the original failure
        }
        throw error;
      }
      await ctx.store.appendHistory(historyEvent({
        report,
        eventType: "REPORT_CREATED",
        fromStatus: "",
        toStatus: "DRAFT",
        changedFields: {
          serviceInvoiceNo: report.serviceInvoiceNo,
          assignedTechnicianUserId: report.assignedTechnicianUserId,
          reportType: report.reportType,
        },
        commandId: input.commandId,
        actor,
        createdAt: now,
      }));
      return { version: report.version, result: { report, invoice, reusedExisting: false } };
    },
  }).catch((error) => {
    // A concurrent creation for the same invoice won the write: open it instead.
    if (error && (error as { errorCode?: string }).errorCode === "DUPLICATE") {
      return ctx.store.findReportByInvoiceNo(input.invoiceNo).then((report) => {
        if (!report) throw error;
        const invoice = ctx.store.listInvoices().then((invoices) =>
          invoices.find((i) => i.invoiceNo === input.invoiceNo) ?? null,
        );
        if (report.reportType !== input.reportType) throw typeConflictFor(report.reportType, report);
        return invoice.then((resolvedInvoice) => ({
          report,
          invoice: resolvedInvoice,
          reusedExisting: true,
        } as ReportWithInvoice & { reusedExisting: boolean }));
      });
    }
    throw error;
  });
}

/** Business conflict: an active report of a different type already exists. */
function typeConflictFor(existingType: string, existing: ServiceReport): never {
  const suffix = existing.serviceReportNo ? ` Open report ${existing.serviceReportNo}.` : "";
  throw duplicate(
    `A service report already exists for this invoice.${suffix}`,
    {
      existingReportId: existing.serviceReportId,
      existingReportType: existing.reportType || "GENERAL",
    },
  );
}

// ── Draft mutations ──────────────────────────────────────────────

/**
 * Corrects a draft report's type before any workflow transition. The report's
 * shared draft values remain intact; type-specific draft data is retained so a
 * technician never loses work merely by correcting a mistaken selection.
 */
export async function changeReportType(
  ctx: OperationContext,
  actor: Actor,
  reportId: string,
  input: ChangeReportTypeInput,
): Promise<ServiceReport> {
  return runWithReceipt(ctx, {
    commandId: input.commandId,
    commandType: "sr.changeReportType",
    reportId,
    operation: "changeReportType",
    input: { expectedVersion: input.expectedVersion, reportType: input.reportType },
    actor,
    execute: async () => {
      const current = await ctx.store.getReport(reportId);
      assertFound(current, reportId);
      const invoice = await invoiceForReport(ctx.store, current);
      const decision = canModifyReport(actor, current, invoice);
      if (!decision.allowed) throw forbidden(decision.reason ?? "Forbidden.");
      if (current.status !== "DRAFT") {
        throw validationError("Only draft Service Reports can change report type.", {
          reportType: "Report type can only be changed while the report is a draft.",
        });
      }
      if (current.reportType === input.reportType) {
        return { version: current.version, result: current };
      }

      const now = nowFor(ctx);
      const next: ServiceReport = {
        ...current,
        reportType: input.reportType,
        version: current.version + 1,
        updatedAt: now,
        updatedBy: actor.userId,
      };
      await ctx.store.updateReport(next, input.expectedVersion);
      await ctx.store.appendHistory(historyEvent({
        report: next,
        eventType: "REPORT_TYPE_CHANGED",
        fromStatus: current.status,
        toStatus: next.status,
        changedFields: { reportType: { from: current.reportType, to: next.reportType } },
        commandId: input.commandId,
        actor,
        createdAt: now,
      }));
      return { version: next.version, result: next };
    },
  });
}

export async function saveDraft(
  ctx: OperationContext,
  actor: Actor,
  reportId: string,
  input: SaveDraftInput,
): Promise<ServiceReport> {
  const commandId = input.reportType === "GENERAL" ? input.general.commandId : input.waterTreatment.commandId;
  const receiptInput = input.reportType === "GENERAL"
    ? {
        expectedVersion: input.general.expectedVersion,
        serviceDate: input.general.serviceDate,
        serviceType: input.general.serviceType,
        fieldReport: input.general.fieldReport,
        remarks: input.general.remarks,
        clientAddress: input.general.clientAddress,
        reportType: "GENERAL",
      }
    : {
        expectedVersion: input.waterTreatment.expectedVersion,
        serviceDate: input.waterTreatment.serviceDate,
        serviceType: input.waterTreatment.serviceType,
        clientName: input.waterTreatment.clientName,
        clientAddress: input.waterTreatment.clientAddress,
        reportType: "WATER_TREATMENT",
        waterTreatmentDetails: input.waterTreatment.details,
      };
  return runWithReceipt(ctx, {
    commandId,
    commandType: "sr.saveDraft",
    reportId,
    operation: "saveDraft",
    input: receiptInput,
    actor,
    execute: async () => {
      const current = await ctx.store.getReport(reportId);
      assertFound(current, reportId);
      if (current.reportType !== input.reportType) {
        throw validationError("reportType is immutable and cannot be changed.", {
          reportType: "reportType is immutable and cannot be changed.",
        });
      }
      const invoice = await invoiceForReport(ctx.store, current);
      const decision = canModifyReport(actor, current, invoice);
      if (!decision.allowed) throw forbidden(decision.reason ?? "Forbidden.");
      const now = nowFor(ctx);

      if (input.reportType === "WATER_TREATMENT") {
        const wt = input.waterTreatment;
        const priorDetails = await ctx.store.getWaterTreatmentDetails(current.serviceReportId);
        const next: ServiceReport = {
          ...current,
          serviceDate: wt.serviceDate,
          serviceType: wt.serviceType,
          clientNameSnapshot: wt.clientName,
          clientAddressSnapshot: wt.clientAddress || current.clientAddressSnapshot,
          version: current.version + 1,
          updatedAt: now,
          updatedBy: actor.userId,
        };
        const nextDetails: WaterTreatmentServiceReportDetails = {
          ...wt.details,
          serviceReportId: current.serviceReportId,
          createdAt: priorDetails?.createdAt || now,
          createdBy: priorDetails?.createdBy || actor.userId,
          updatedAt: now,
          updatedBy: actor.userId,
        };
        // One logical operation: the detail row is written first, then the
        // version-guarded parent. If the parent write fails (e.g. version
        // conflict), the prior detail row is restored so no partial state remains.
        await ctx.store.updateWaterTreatmentDetails(nextDetails);
        try {
          await ctx.store.updateReport(next, wt.expectedVersion);
        } catch (error) {
          if (priorDetails) {
            try {
              await ctx.store.updateWaterTreatmentDetails({ ...priorDetails, updatedAt: now, updatedBy: actor.userId });
            } catch {
              // Best effort restore; the parent write error remains authoritative.
            }
          }
          throw error;
        }
        await ctx.store.appendHistory(historyEvent({
          report: next,
          eventType: "REPORT_UPDATED",
          fromStatus: current.status,
          toStatus: next.status,
          changedFields: {
            serviceDate: next.serviceDate,
            serviceType: next.serviceType,
            clientNameSnapshot: next.clientNameSnapshot,
            clientAddressSnapshot: next.clientAddressSnapshot,
          },
          commandId: input.waterTreatment.commandId,
          actor,
          createdAt: now,
        }));
        return { version: next.version, result: next };
      }

      const g = input.general;
      const next: ServiceReport = {
        ...current,
        serviceDate: g.serviceDate,
        serviceType: g.serviceType,
        fieldReport: g.fieldReport,
        remarks: g.remarks,
        // Draft-only site correction; locked after ready/acknowledged.
        clientAddressSnapshot: g.clientAddress || current.clientAddressSnapshot,
        version: current.version + 1,
        updatedAt: now,
        updatedBy: actor.userId,
      };
      const event = historyEvent({
        report: next,
        eventType: "REPORT_UPDATED",
        fromStatus: current.status,
        toStatus: next.status,
        changedFields: {
          serviceDate: next.serviceDate,
          serviceType: next.serviceType,
          fieldReport: next.fieldReport,
          remarks: next.remarks,
          clientAddressSnapshot: next.clientAddressSnapshot,
        },
        commandId: g.commandId,
        actor,
        createdAt: now,
      });
      await ctx.store.updateReport(next, g.expectedVersion); // throws VERSION_CONFLICT
      await ctx.store.appendHistory(event);
      return { version: next.version, result: next };
    },
  });
}

export async function markReady(
  ctx: OperationContext,
  actor: Actor,
  reportId: string,
  input: ExpectedVersionInput,
): Promise<ServiceReport> {
  return runWithReceipt(ctx, {
    commandId: input.commandId,
    commandType: "sr.markReady",
    reportId,
    operation: "markReady",
    input: { expectedVersion: input.expectedVersion },
    actor,
    execute: async () => {
      const current = await ctx.store.getReport(reportId);
      assertFound(current, reportId);
      const invoice = await invoiceForReport(ctx.store, current);
      const access = canAccessReport(actor, current, invoice);
      if (!access.allowed) throw forbidden(access.reason ?? "Forbidden.");
      if (current.status !== "DRAFT") {
        throw validationError(`Only drafts can be marked ready. This report is ${current.status}.`);
      }
      const now = nowFor(ctx);
      const next: ServiceReport = {
        ...current,
        status: "READY_FOR_ACKNOWLEDGMENT",
        version: current.version + 1,
        updatedAt: now,
        updatedBy: actor.userId,
      };
      const event = historyEvent({
        report: next,
        eventType: "READY_FOR_ACKNOWLEDGMENT",
        fromStatus: current.status,
        toStatus: next.status,
        commandId: input.commandId,
        actor,
        createdAt: now,
      });
      await ctx.store.updateReport(next, input.expectedVersion);
      await ctx.store.appendHistory(event);
      return { version: next.version, result: next };
    },
  });
}

// ── Acknowledgment ───────────────────────────────────────────────

export async function acknowledge(
  ctx: OperationContext,
  actor: Actor,
  reportId: string,
  input: AcknowledgeInput,
): Promise<AcknowledgeResult> {
  return runWithReceipt(ctx, {
    commandId: input.commandId,
    commandType: "sr.acknowledge",
    reportId,
    operation: "acknowledge",
    input: {
      expectedVersion: input.expectedVersion,
      acknowledgedByFullName: input.acknowledgedByFullName,
      acknowledgedByPosition: input.acknowledgedByPosition,
      consentConfirmed: input.consentConfirmed,
    },
    actor,
    execute: async () => {
      const current = await ctx.store.getReport(reportId);
      assertFound(current, reportId);
      const invoice = await invoiceForReport(ctx.store, current);
      const access = canAccessReport(actor, current, invoice);
      if (!access.allowed) throw forbidden(access.reason ?? "Forbidden.");

      // Idempotent by state: a retried/lost acknowledgment never allocates a
      // second report number, uploads a second signature or writes a second row.
      if (current.status === "ACKNOWLEDGED" || current.status === "PDF_FAILED") {
        return {
          version: current.version,
          result: {
            report: current,
            pdfReady: current.pdfGenerationStatus === "READY",
            pdfWarning: undefined,
            reused: true,
          },
        };
      }
      if (current.status !== "READY_FOR_ACKNOWLEDGMENT") {
        throw validationError(`This report must be ready for acknowledgment (current status ${current.status}).`);
      }
      if (!input.consentConfirmed) {
        throw validationError("The acknowledgment statement must be checked before the report can be acknowledged.", {
          consentConfirmed: "The acknowledgment statement must be checked.",
        });
      }
      if (!input.acknowledgedByFullName.trim()) {
        throw validationError("The customer representative full name is required.", {
          acknowledgedByFullName: "The customer representative full name is required.",
        });
      }
      const verdict = verifyMeaningfulSignature(analyseSignaturePng(input.signaturePng));
      if (!verdict.ok) {
        throw validationError(verdict.reason, { signature: verdict.reason });
      }

      const year = businessDateYear(current.serviceDate);
      const allocation = await ctx.store.allocateReportNumber(year);
      const uploaded = await ctx.drive.uploadPrivateFile({
        fileName: `SR-${allocation.reportNo}.signature.png`,
        mimeType: "image/png",
        buffer: input.signaturePng,
        description: `Customer signature for ${allocation.reportNo}`,
      });

      const now = nowFor(ctx);
      const next: ServiceReport = {
        ...current,
        serviceReportNo: allocation.reportNo,
        acknowledgedByFullName: input.acknowledgedByFullName.trim(),
        acknowledgedByPosition: input.acknowledgedByPosition,
        acknowledgmentTextVersion: ACKNOWLEDGMENT_TEXT_VERSION,
        consentConfirmed: true,
        signatureDriveFileId: uploaded.fileId,
        signatureUrl: uploaded.url,
        signatureSha256: sha256HexBuffer(input.signaturePng),
        signatureMimeType: "image/png",
        signatureSize: input.signaturePng.length,
        signedAt: now,
        status: "ACKNOWLEDGED",
        pdfGenerationStatus: "NONE",
        version: current.version + 1,
        updatedAt: now,
        updatedBy: actor.userId,
      };

      // The report row is the authoritative record. If this write fails the
      // uploaded signature is deleted so no orphaned private file survives.
      try {
        await ctx.store.updateReport(next, input.expectedVersion);
      } catch (error) {
        try {
          await ctx.drive.deleteFile(uploaded.fileId);
        } catch {
          // The file is already gone — nothing to compensate.
        }
        throw error;
      }
      await ctx.store.appendHistory(historyEvent({
        report: next,
        eventType: "ACKNOWLEDGED",
        fromStatus: current.status,
        toStatus: "ACKNOWLEDGED",
        changedFields: {
          serviceReportNo: next.serviceReportNo,
          acknowledgedByFullName: next.acknowledgedByFullName,
          acknowledgedByPosition: next.acknowledgedByPosition,
        },
        commandId: input.commandId,
        actor,
        createdAt: now,
      }));
      const finalResult = await finishAcknowledgementPdf(ctx, actor, next, input.commandId, input.signaturePng);
      return { version: finalResult.report.version, result: finalResult };
    },
  });
}

/**
 * Generates and uploads the final A4 PDF after the acknowledgment row is
 * committed. A failure flips the report to PDF_FAILED but never removes the
 * acknowledgment, number, or signature.
 */
async function finishAcknowledgementPdf(
  ctx: OperationContext,
  actor: Actor,
  report: ServiceReport,
  commandId: string,
  signaturePng: Buffer,
): Promise<AcknowledgeResult> {
  if (!ctx.options.pdfRenderer) {
    return { report, pdfReady: false, pdfWarning: undefined, reused: false };
  }
  try {
    const details = report.reportType === "WATER_TREATMENT"
      ? (await ctx.store.getWaterTreatmentDetails(report.serviceReportId))
          ?? emptyWaterTreatmentDetails(report.serviceReportId, report.createdBy || actor.userId, nowFor(ctx))
      : null;
    const signatureBase64 = Buffer.from(signaturePng).toString("base64");
    const pdfBuffer = await ctx.options.pdfRenderer(report, details, signatureBase64);
    const uploaded = await ctx.drive.uploadPrivateFile({
      fileName: report.reportType === "WATER_TREATMENT"
        ? waterTreatmentPdfFileName(report.serviceReportNo)
        : `SR-${report.serviceReportNo}.pdf`,
      mimeType: "application/pdf",
      buffer: pdfBuffer,
      description: report.reportType === "WATER_TREATMENT"
        ? `Water Treatment System Service Report ${report.serviceReportNo}`
        : `General Service Report ${report.serviceReportNo}`,
    });
    const now = nowFor(ctx);
    const withPdf: ServiceReport = {
      ...report,
      pdfDriveFileId: uploaded.fileId,
      pdfUrl: uploaded.url,
      pdfGenerationStatus: "READY",
      version: report.version + 1,
      updatedAt: now,
      updatedBy: actor.userId,
    };
    await ctx.store.updateReport(withPdf, report.version);
    await ctx.store.appendHistory(historyEvent({
      report: withPdf,
      eventType: "PDF_READY",
      fromStatus: report.status,
      toStatus: "ACKNOWLEDGED",
      commandId,
      actor,
      createdAt: now,
    }));
    return { report: withPdf, pdfReady: true, pdfWarning: undefined, reused: false };
  } catch (pdfError) {
    const failed: ServiceReport = {
      ...report,
      status: "PDF_FAILED",
      pdfGenerationStatus: "FAILED",
      version: report.version + 1,
      updatedAt: nowFor(ctx),
      updatedBy: actor.userId,
    };
    try {
      await ctx.store.updateReport(failed, report.version);
      await ctx.store.appendHistory(historyEvent({
        report: failed,
        eventType: "PDF_FAILED",
        fromStatus: "ACKNOWLEDGED",
        toStatus: "PDF_FAILED",
        reason: pdfError instanceof Error ? pdfError.message : String(pdfError),
        commandId,
        actor,
        createdAt: nowFor(ctx),
      }));
    } catch {
      // Worst case the report stays ACKNOWLEDGED with PdfGenerationStatus NONE;
      // the admin PDF retry route still works because the acknowledgment exists.
    }
    const message = pdfError instanceof Error ? pdfError.message : String(pdfError);
    return {
      report: failed,
      pdfReady: false,
      pdfWarning: `The Service Report was acknowledged and signed, but the PDF could not be generated: ${message}. An admin can retry from the report page.`,
      reused: false,
    };
  }
}

// ── PDF retry (admin) ────────────────────────────────────────────

export async function generatePdfRetry(
  ctx: OperationContext,
  actor: Actor,
  reportId: string,
  input: PdfRetryInput,
): Promise<{ report: ServiceReport; reused: boolean }> {
  return runWithReceipt(ctx, {
    commandId: input.commandId,
    commandType: "sr.pdfRetry",
    reportId,
    operation: "generatePdfRetry",
    input: { expectedVersion: input.expectedVersion },
    actor,
    execute: async () => {
      const admin = canAdministerReport(actor);
      if (!admin.allowed) throw forbidden(admin.reason ?? "Forbidden.");
      const current = await ctx.store.getReport(reportId);
      assertFound(current, reportId);
      if (current.status === "ACKNOWLEDGED" && current.pdfGenerationStatus === "READY") {
        return { version: current.version, result: { report: current, reused: true } as { report: ServiceReport; reused: boolean } };
      }
      if (current.status !== "PDF_FAILED") {
        throw validationError(`PDF retry is only available for reports awaiting PDF generation (current status ${current.status}).`);
      }
      if (!ctx.options.pdfRenderer) throw new Error("No PDF renderer is configured.");
      if (!current.signatureDriveFileId) {
        throw validationError("The acknowledgment is missing its signature file; the PDF cannot be generated.", {});
      }
      const signatureBase64 = await ctx.drive.fetchFileBase64(current.signatureDriveFileId);
      const details = current.reportType === "WATER_TREATMENT"
        ? (await ctx.store.getWaterTreatmentDetails(current.serviceReportId))
            ?? emptyWaterTreatmentDetails(current.serviceReportId, current.createdBy || actor.userId, nowFor(ctx))
        : null;
      const pdfBuffer = await ctx.options.pdfRenderer(current, details, signatureBase64);
      const uploaded = await ctx.drive.uploadPrivateFile({
        fileName: current.reportType === "WATER_TREATMENT"
          ? waterTreatmentPdfFileName(current.serviceReportNo)
          : `SR-${current.serviceReportNo}.pdf`,
        mimeType: "application/pdf",
        buffer: pdfBuffer,
        description: current.reportType === "WATER_TREATMENT"
          ? `Water Treatment System Service Report ${current.serviceReportNo}`
          : `General Service Report ${current.serviceReportNo}`,
      });
      const now = nowFor(ctx);
      const next: ServiceReport = {
        ...current,
        status: "ACKNOWLEDGED",
        pdfDriveFileId: uploaded.fileId,
        pdfUrl: uploaded.url,
        pdfGenerationStatus: "READY",
        version: current.version + 1,
        updatedAt: now,
        updatedBy: actor.userId,
      };
      await ctx.store.updateReport(next, input.expectedVersion);
      await ctx.store.appendHistory(historyEvent({
        report: next,
        eventType: "PDF_READY",
        fromStatus: current.status,
        toStatus: "ACKNOWLEDGED",
        commandId: input.commandId,
        actor,
        createdAt: now,
      }));
      return { version: next.version, result: { report: next, reused: false } };
    },
  });
}

// ── Void (admin only) ────────────────────────────────────────────

export async function voidReport(
  ctx: OperationContext,
  actor: Actor,
  reportId: string,
  input: VoidInput,
): Promise<ServiceReport> {
  return runWithReceipt(ctx, {
    commandId: input.commandId,
    commandType: "sr.void",
    reportId,
    operation: "voidReport",
    input: { expectedVersion: input.expectedVersion, reason: input.reason },
    actor,
    execute: async () => {
      const admin = canAdministerReport(actor);
      if (!admin.allowed) throw forbidden(admin.reason ?? "Forbidden.");
      const current = await ctx.store.getReport(reportId);
      assertFound(current, reportId);
      if (current.status === "VOID") {
        return { version: current.version, result: current };
      }
      if (!canTransition(current.status, "VOID")) {
        throw validationError(`Report ${reportId} cannot be voided from status ${current.status}.`);
      }
      const now = nowFor(ctx);
      const next: ServiceReport = {
        ...current,
        status: "VOID",
        voidReason: input.reason,
        version: current.version + 1,
        updatedAt: now,
        updatedBy: actor.userId,
      };
      const event = historyEvent({
        report: next,
        eventType: "VOIDED",
        fromStatus: current.status,
        toStatus: "VOID",
        reason: input.reason,
        commandId: input.commandId,
        actor,
        createdAt: now,
      });
      await ctx.store.updateReport(next, input.expectedVersion);
      await ctx.store.appendHistory(event);
      return { version: next.version, result: next };
    },
  });
}
