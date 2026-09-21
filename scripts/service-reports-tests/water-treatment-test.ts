// Water Treatment System Service Report - focused tests.

import assert from "node:assert/strict";
import {
  createOperationContext,
  createOrOpenReport,
  saveDraft,
  markReady,
  acknowledge,
  getReportDetail,
} from "../../src/lib/serviceReports/service.ts";
import { InMemoryServiceReportStore } from "./fake-store.ts";
import { FakeServiceReportDrive, makeInvoice, TECHNICIAN, OTHER_USER, ADMIN } from "./fake-drive.ts";
import { ServiceReportError } from "../../src/lib/serviceReports/errors.ts";
import type { WaterTreatmentServiceReportDetails } from "../../src/types/serviceReport.ts";
import {
  emptyWaterTreatmentDetails,
  waterTreatmentDetailsFromRow,
  waterTreatmentDetailsToRow,
  waterTreatmentPdfFileName,
  waterTreatmentPdfMeasurementSections,
  waterTreatmentPdfEquipmentRows,
} from "../../src/lib/serviceReports/waterTreatmentDetails.ts";
import {
  SERVICE_REPORTS_HEADERS,
  SERVICE_REPORTS_ROW_WIDTH,
  WATER_TREATMENT_DETAILS_HEADERS,
  WATER_TREATMENT_DETAILS_ROW_WIDTH,
} from "../../src/lib/serviceReports/constants.ts";
import { meaningfulSignaturePng } from "./png-util.ts";
import type { ServiceReportPdfRenderer } from "../../src/lib/serviceReports/storeTypes.ts";

const UUID = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const PDF_RENDERER: ServiceReportPdfRenderer = async (report) => Buffer.from(`PDF-${report.serviceReportNo}`, "utf8");

function freshStore() {
  const store = new InMemoryServiceReportStore();
  store.invoices.push(makeInvoice());
  const drive = new FakeServiceReportDrive();
  const ctx = createOperationContext(store, drive, { pdfRenderer: PDF_RENDERER });
  return { store, drive, ctx };
}

function wtSave(
  ctx: ReturnType<typeof freshStore>["ctx"],
  actor: typeof TECHNICIAN | typeof OTHER_USER | typeof ADMIN,
  reportId: string,
  commandNo: number,
  version: number,
  over: {
    clientName?: string;
    clientAddress?: string;
    email?: string;
    details?: Partial<WaterTreatmentServiceReportDetails>;
  } = {},
) {
  const base = emptyWaterTreatmentDetails(reportId, actor.userId, "2026-09-21T00:00:00.000Z");
  const details: WaterTreatmentServiceReportDetails = {
    ...base,
    emailAddress: over.email ?? "tech@example.com",
    ...(over.details ?? {}),
  };
  return saveDraft(ctx, actor, reportId, {
    reportType: "WATER_TREATMENT",
    waterTreatment: {
      commandId: UUID(commandNo),
      expectedVersion: version,
      serviceDate: "2026-09-21",
      serviceType: "Preventive maintenance",
      clientName: over.clientName ?? "Acme Corporation",
      clientAddress: over.clientAddress ?? "123 Main St",
      details,
    },
  });
}

(async () => {
  // 2. WATER_TREATMENT creation: exactly one parent + one detail row.
  const { store, ctx } = freshStore();
  const created = await createOrOpenReport(ctx, TECHNICIAN, { commandId: UUID(1), invoiceNo: "1001", reportType: "WATER_TREATMENT" });
  assert.equal(created.reusedExisting, false);
  assert.equal(created.report.reportType, "WATER_TREATMENT");
  const parentCount = store.reports.filter((r) => r.serviceReportId === created.report.serviceReportId && r.status !== "VOID").length;
  assert.equal(parentCount, 1, "one active parent row");
  const detailCount = Array.from(store.waterTreatmentDetails.values()).filter((d) => d.serviceReportId === created.report.serviceReportId).length;
  assert.equal(detailCount, 1, "exactly one detail row is created");

  // 8. Email/Client Name/Address/Service Type persistence; sources untouched.
  await wtSave(ctx, TECHNICIAN, created.report.serviceReportId, 2, 1, {
    clientName: "Edited Client Inc.",
    clientAddress: "99 Edited Ave",
    email: "clientrep@edited.example",
    details: { emailAddress: "clientrep@edited.example" },
  });
  const reloaded = await getReportDetail(ctx, TECHNICIAN, created.report.serviceReportId);
  assert.equal(reloaded.report.clientNameSnapshot, "Edited Client Inc.");
  assert.equal(reloaded.report.clientAddressSnapshot, "99 Edited Ave");
  assert.equal(reloaded.report.serviceType, "Preventive maintenance");
  assert.equal(reloaded.report.assignedTechnicianNameSnapshot, "Tech One", "Attended by is the server snapshot");
  assert.equal(reloaded.report.assignedTechnicianUserId, "tech-1");
  assert.equal(reloaded.waterTreatmentDetails?.emailAddress, "clientrep@edited.example");
  assert.equal(store.invoices[0].companyName, "Acme Corporation", "Service Invoice company is never back-written");
  assert.equal(store.invoices[0].address, "123 Main St", "Service Invoice address is never back-written");

  // 9/10. Blank stays blank; zero stays zero; N/A allowed.
  await wtSave(ctx, TECHNICIAN, created.report.serviceReportId, 3, 2, {
    details: { feedTdsBefore: "0", feedTdsAfter: "", preFilterInletPressureAfter: "N/A" },
  });
  const savedDetails = store.waterTreatmentDetails.get(created.report.serviceReportId)!;
  assert.equal(savedDetails.feedTdsBefore, "0");
  assert.equal(savedDetails.feedTdsAfter, "");
  assert.equal(savedDetails.preFilterInletPressureAfter, "N/A");

  // 11. Free-text water-sample answers persist.
  await wtSave(ctx, TECHNICIAN, created.report.serviceReportId, 4, 3, {
    details: {
      microbiologicalWaterSampleResult: "No growth observed",
      physicalChemicalWaterSampleResult: "pH 7.2 / TDS 45",
    },
  });
  const sampleDetails = store.waterTreatmentDetails.get(created.report.serviceReportId)!;
  assert.equal(sampleDetails.microbiologicalWaterSampleResult, "No growth observed");
  assert.equal(sampleDetails.physicalChemicalWaterSampleResult, "pH 7.2 / TDS 45");
  // 4. Duplicate creation for the same Service Invoice returns the same report.
  const reopened = await createOrOpenReport(ctx, TECHNICIAN, { commandId: UUID(5), invoiceNo: "1001", reportType: "WATER_TREATMENT" });
  assert.equal(reopened.reusedExisting, true);
  assert.equal(reopened.report.serviceReportId, created.report.serviceReportId);
  assert.equal(reopened.report.reportType, "WATER_TREATMENT");

  // 5. Different-type creation conflict.
  const conflictError = await createOrOpenReport(ctx, TECHNICIAN, { commandId: UUID(6), invoiceNo: "1001", reportType: "GENERAL" })
    .then(() => null, (error: ServiceReportError) => error);
  assert.ok(conflictError instanceof ServiceReportError);
  assert.equal(conflictError.errorCode, "DUPLICATE");
  assert.match(conflictError.message, /already exists for this invoice/);
  assert.equal(conflictError.fieldErrors?.existingReportId, created.report.serviceReportId);
  assert.equal(conflictError.fieldErrors?.existingReportType, "WATER_TREATMENT");
  const storedAfterConflict = store.reports.find((r) => r.serviceReportId === created.report.serviceReportId)!;
  assert.equal(storedAfterConflict.reportType, "WATER_TREATMENT", "type is never silently changed");

  // GENERAL-first invoice, then WATER_TREATMENT create - same conflict.
  const { ctx: ctxB } = freshStore();
  await createOrOpenReport(ctxB, TECHNICIAN, { commandId: UUID(40), invoiceNo: "1001", reportType: "GENERAL" });
  const conflictB = await createOrOpenReport(ctxB, TECHNICIAN, { commandId: UUID(41), invoiceNo: "1001", reportType: "WATER_TREATMENT" })
    .then(() => null, (error: ServiceReportError) => error);
  assert.ok(conflictB instanceof ServiceReportError);
  assert.equal(conflictB.errorCode, "DUPLICATE");
  assert.equal(conflictB.fieldErrors?.existingReportType, "GENERAL");

  // 6. ReportType immutability at the service boundary.
  const typeChange = await saveDraft(ctx, TECHNICIAN, created.report.serviceReportId, {
    reportType: "GENERAL",
    general: {
      commandId: UUID(7), expectedVersion: 4, serviceDate: "2026-09-21",
      serviceType: "PM", fieldReport: "general", remarks: "", clientAddress: "",
    },
  }).then(() => null, (error: ServiceReportError) => error);
  assert.ok(typeChange instanceof ServiceReportError);
  assert.equal(typeChange.errorCode, "VALIDATION");
  assert.match(typeChange.message, /immutable/);

  // 7. Expected-version conflict protection.
  const versionConflict = await wtSave(ctx, TECHNICIAN, created.report.serviceReportId, 8, 1)
    .then(() => null, (error: ServiceReportError) => error);
  assert.ok(versionConflict instanceof ServiceReportError);
  assert.equal(versionConflict.errorCode, "VERSION_CONFLICT");
  assert.equal(versionConflict.status, 409);
  assert.equal(versionConflict.currentVersion, 4);

  // 12. Raw Tank ... UV Light accept only WORKING/DEFECTIVE (no third stored status).
  const weird = waterTreatmentDetailsFromRow(
    Array.from({ length: 89 }, (_, i) => (i === 54 || i === 52) ? "BROKEN" : ""),
  );
  assert.equal(weird.rawTankStatus, "", "non-WORKING/DEFECTIVE text normalizes to blank");
  assert.equal(weird.microbiologicalWaterSampleResult, "BROKEN", "free-text sample column is NOT an equipment selector");

  // 13/14. Unauthorized user 403; technician + admin allowed.
  const { ctx: ctxC, drive: driveC } = freshStore();
  const otherCreate = await createOrOpenReport(ctxC, OTHER_USER, { commandId: UUID(50), invoiceNo: "1001", reportType: "WATER_TREATMENT" })
    .then(() => null, (error: ServiceReportError) => error);
  assert.ok(otherCreate instanceof ServiceReportError);
  assert.equal(otherCreate.status, 403);
  const adminCreate = await createOrOpenReport(ctxC, ADMIN, { commandId: UUID(51), invoiceNo: "1001", reportType: "WATER_TREATMENT" });
  assert.equal(adminCreate.report.reportType, "WATER_TREATMENT");
  const otherSave = await wtSave(ctxC, OTHER_USER, adminCreate.report.serviceReportId, 52, 1)
    .then(() => null, (error: ServiceReportError) => error);
  assert.ok(otherSave instanceof ServiceReportError);
  assert.equal(otherSave.status, 403);

  // 15. Signed reports remain immutable.
  await wtSave(ctxC, ADMIN, adminCreate.report.serviceReportId, 53, 1, {
    details: { feedTdsBefore: "10" },
  });
  await markReady(ctxC, ADMIN, adminCreate.report.serviceReportId, { commandId: UUID(54), expectedVersion: 2 });
  const signed = await acknowledge(ctxC, ADMIN, adminCreate.report.serviceReportId, {
    commandId: UUID(55),
    expectedVersion: 3,
    acknowledgedByFullName: "Juan Dela Cruz",
    acknowledgedByPosition: "Building Administrator",
    consentConfirmed: true,
    signaturePng: meaningfulSignaturePng(),
  });
  assert.equal(signed.report.status, "ACKNOWLEDGED");
  assert.equal(signed.report.pdfGenerationStatus, "READY", "the Water Treatment PDF is generated at acknowledgment");
  const wtPdf = driveC.files.find((f) => f.mimeType === "application/pdf");
  assert.ok(wtPdf);
  assert.match(wtPdf.fileName, /^AIC-SR-2026-\d{4}-Water-Treatment\.pdf$/);
  const signedEdit = await wtSave(ctxC, ADMIN, adminCreate.report.serviceReportId, 56, signed.report.version)
    .then(() => null, (error: ServiceReportError) => error);
  assert.ok(signedEdit instanceof ServiceReportError);
  assert.equal(signedEdit.status, 403);
  // 16. Water Treatment PDF mapping.
  assert.equal(waterTreatmentPdfFileName("AIC-SR-2026-0001"), "AIC-SR-2026-0001-Water-Treatment.pdf");
  assert.equal(waterTreatmentPdfFileName(""), "DRAFT-Water-Treatment.pdf");
  const pdfDetails = emptyWaterTreatmentDetails("report-pdf", "tech-1", "2026-09-21T00:00:00.000Z");
  pdfDetails.feedTdsBefore = "0";
  pdfDetails.feedTdsAfter = "";
  pdfDetails.rawTankStatus = "WORKING";
  pdfDetails.uvLightStatus = "DEFECTIVE";
  const measurementSections = waterTreatmentPdfMeasurementSections(pdfDetails);
  assert.equal(measurementSections[0].rows[0].before, "0", "zero is preserved in the PDF mapping");
  assert.equal(measurementSections[0].rows[0].after, "", "blank stays blank in the PDF mapping");
  const equipmentRows = waterTreatmentPdfEquipmentRows(pdfDetails);
  assert.equal(equipmentRows.find((r) => r.label === "Raw Tank")?.value, "WORKING");
  assert.equal(equipmentRows.find((r) => r.label === "UV Light")?.value, "DEFECTIVE");
  const roundTrip = waterTreatmentDetailsFromRow(waterTreatmentDetailsToRow(pdfDetails));
  assert.equal(roundTrip.feedTdsBefore, "0");
  assert.equal(roundTrip.feedTdsAfter, "");
  assert.equal(roundTrip.rawTankStatus, "WORKING");

  // 3. One detail row per report survives further saves.
  assert.equal(
    Array.from(store.waterTreatmentDetails.values()).filter((d) => d.serviceReportId === created.report.serviceReportId).length,
    1,
    "saveDraft must upsert, never duplicate, the detail row",
  );

  // 18. Schema contracts: exact columns, order, width. ServiceReports uses the
  //     canonical A:AH order (ReportType in column C, CompanyId in column E);
  //     the full order and the mapper round trip live in report-mapper-test.ts.
  assert.equal(SERVICE_REPORTS_HEADERS.length, SERVICE_REPORTS_ROW_WIDTH, "34 columns A:AH");
  assert.equal(SERVICE_REPORTS_HEADERS[2], "ReportType");
  assert.equal(SERVICE_REPORTS_HEADERS[SERVICE_REPORTS_ROW_WIDTH - 1], "UpdatedBy");
  assert.equal(WATER_TREATMENT_DETAILS_HEADERS.length, WATER_TREATMENT_DETAILS_ROW_WIDTH, "89 unique columns per plan");
  assert.equal(WATER_TREATMENT_DETAILS_HEADERS[0], "ServiceReportId");
  assert.equal(WATER_TREATMENT_DETAILS_HEADERS[1], "EmailAddress");
  assert.equal(WATER_TREATMENT_DETAILS_HEADERS[WATER_TREATMENT_DETAILS_ROW_WIDTH - 1], "UpdatedBy");
  assert.ok(WATER_TREATMENT_DETAILS_HEADERS.includes("MicrobiologicalWaterSampleResult"));
  assert.ok(WATER_TREATMENT_DETAILS_HEADERS.includes("PhysicalChemicalWaterSampleResult"));
  assert.equal(new Set(WATER_TREATMENT_DETAILS_HEADERS).size, WATER_TREATMENT_DETAILS_ROW_WIDTH, "no duplicate header names");
  assert.equal(
    waterTreatmentDetailsToRow(emptyWaterTreatmentDetails("report-width", "tech-1", "2026-09-21T00:00:00.000Z")).length,
    WATER_TREATMENT_DETAILS_ROW_WIDTH,
    "row mapper emits exactly 89 columns",
  );

  // 1. GENERAL compatibility is proven by the existing focused suites; this
  //     module adds the WATER_TREATMENT-specific assertions on top of them.
  // 17. Existing General PDF behavior: unchanged filename and no detail row.
  const general = freshStore();
  const createdGeneral = await createOrOpenReport(general.ctx, TECHNICIAN, { commandId: UUID(70), invoiceNo: "1001", reportType: "GENERAL" });
  await saveDraft(general.ctx, TECHNICIAN, createdGeneral.report.serviceReportId, {
    reportType: "GENERAL",
    general: {
      commandId: UUID(71), expectedVersion: 1, serviceDate: "2026-09-21",
      serviceType: "Preventive maintenance", fieldReport: "Completed.", remarks: "", clientAddress: "",
    },
  });
  await markReady(general.ctx, TECHNICIAN, createdGeneral.report.serviceReportId, { commandId: UUID(72), expectedVersion: 2 });
  const generalAck = await acknowledge(general.ctx, TECHNICIAN, createdGeneral.report.serviceReportId, {
    commandId: UUID(73),
    expectedVersion: 3,
    acknowledgedByFullName: "Juan Dela Cruz",
    acknowledgedByPosition: "",
    consentConfirmed: true,
    signaturePng: meaningfulSignaturePng(),
  });
  assert.equal(generalAck.report.status, "ACKNOWLEDGED");
  assert.equal(generalAck.report.pdfGenerationStatus, "READY");
  const generalPdf = general.drive.files.find((f) => f.mimeType === "application/pdf");
  assert.ok(generalPdf);
  assert.match(generalPdf.fileName, /^SR-AIC-SR-2026-\d{4}\.pdf$/, "General PDF filename is unchanged");
  assert.equal(general.store.waterTreatmentDetails.size, 0, "a General report creates no detail row");
  const generalDetail = await getReportDetail(general.ctx, TECHNICIAN, createdGeneral.report.serviceReportId);
  assert.equal(generalDetail.waterTreatmentDetails, null, "GENERAL detail responses return no waterTreatmentDetails");

  console.log("water treatment service tests passed");
})().catch((error) => {
  console.error("water treatment service tests failed:", error);
  process.exitCode = 1;
});
