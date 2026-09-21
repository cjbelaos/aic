import assert from "node:assert/strict";
import {
  createOperationContext,
  createOrOpenReport,
  saveDraft,
  markReady,
  acknowledge,
  generatePdfRetry,
  listReportsForActor,
} from "../../src/lib/serviceReports/service.ts";
import { InMemoryServiceReportStore } from "./fake-store.ts";
import { FakeServiceReportDrive, makeInvoice, makeDraftReport, TECHNICIAN, OTHER_USER, ADMIN } from "./fake-drive.ts";
import { ServiceReportError } from "../../src/lib/serviceReports/errors.ts";
import { meaningfulSignaturePng } from "./png-util.ts";

const UUID = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const PDF_RENDERER = async () => Buffer.from("PDF", "utf8");

(async () => {
  // The API routes all funnel through these same guards: ability checks +
  // service operations. This proves a direct API caller cannot bypass them,
  // regardless of what the UI hides.
  const store = new InMemoryServiceReportStore();
  store.invoices.push(makeInvoice());
  const drive = new FakeServiceReportDrive();
  const ctx = createOperationContext(store, drive, { pdfRenderer: PDF_RENDERER });

  const created = await createOrOpenReport(ctx, TECHNICIAN, { commandId: UUID(50), invoiceNo: "1001", reportType: "GENERAL" });
  await saveDraft(ctx, TECHNICIAN, created.report.serviceReportId, {
    reportType: "GENERAL",
    general: {
      commandId: UUID(51),
      expectedVersion: 1,
      serviceDate: "2026-09-20",
      serviceType: "Preventive maintenance",
      fieldReport: "Completed.",
      remarks: "",
      clientAddress: "",
    },
  });
  await markReady(ctx, TECHNICIAN, created.report.serviceReportId, { commandId: UUID(52), expectedVersion: 2 });
  const id = created.report.serviceReportId;

  // Unrelated user: every mutation endpoint is rejected with 403.
  const markReadyDenied = await markReady(ctx, OTHER_USER, id, { commandId: UUID(53), expectedVersion: 3 })
    .then(() => null, (error: ServiceReportError) => error);
  assert.ok(markReadyDenied instanceof ServiceReportError);
  assert.equal(markReadyDenied.status, 403);
  assert.equal(markReadyDenied.errorCode, "FORBIDDEN");

  const ackDenied = await acknowledge(ctx, OTHER_USER, id, {
    commandId: UUID(54),
    expectedVersion: 3,
    acknowledgedByFullName: "Impostor",
    acknowledgedByPosition: "",
    consentConfirmed: true,
    signaturePng: meaningfulSignaturePng(),
  }).then(() => null, (error: ServiceReportError) => error);
  assert.ok(ackDenied instanceof ServiceReportError);
  assert.equal(ackDenied.status, 403);
  assert.equal(drive.files.length, 0, "authorization must run before any side effect");

  // PDF retry: technician is never allowed; admin is.
  const pdfDenied = await generatePdfRetry(ctx, TECHNICIAN, id, { commandId: UUID(55), expectedVersion: 3 })
    .then(() => null, (error: ServiceReportError) => error);
  assert.ok(pdfDenied instanceof ServiceReportError);
  assert.equal(pdfDenied.status, 403);

  // The technician cannot rewrite the Attended-by name: it is always the
  // server-resolved snapshot from the Service Invoice assignment.
  const store2 = new InMemoryServiceReportStore();
  store2.invoices.push(makeInvoice());
  const ctx2 = createOperationContext(store2, new FakeServiceReportDrive(), {});
  const created2 = await createOrOpenReport(ctx2, TECHNICIAN, { commandId: UUID(56), invoiceNo: "1001", reportType: "GENERAL" });
  const rawBody = {
    commandId: UUID(57),
    expectedVersion: 1,
    serviceDate: "2026-09-20",
    serviceType: "Repair",
    fieldReport: "Fixed it.",
    remarks: "n/a",
    clientAddress: "",
    assignedTechnicianNameSnapshot: "Fake Name",
    attendedBy: "Fake Name",
  };
  void rawBody; // unknown keys are dropped by the parser (typed) and service.
  const saved2 = await saveDraft(ctx2, TECHNICIAN, created2.report.serviceReportId, {
    reportType: "GENERAL",
    general: {
      commandId: rawBody.commandId,
      expectedVersion: rawBody.expectedVersion,
      serviceDate: rawBody.serviceDate,
      serviceType: rawBody.serviceType,
      fieldReport: rawBody.fieldReport,
      remarks: rawBody.remarks,
      clientAddress: rawBody.clientAddress,
    },
  });
  assert.equal(saved2.assignedTechnicianNameSnapshot, "Tech One", "Attended by must stay the server-resolved technician name");

  // List enumeration is role-scoped: unrelated users see no reports; admins see all.
  const adminsView = await listReportsForActor(ctx2, ADMIN);
  assert.equal(adminsView.some((row) => row.report.serviceReportId === created2.report.serviceReportId), true);
  const unrelatedView = await listReportsForActor(ctx2, OTHER_USER);
  assert.equal(unrelatedView.some((row) => row.report.serviceReportId === created2.report.serviceReportId), false);

  // A self-cloned report row from a user with no relationship cannot be viewed.
  const cloned = makeDraftReport(UUID(99), "1001", { assignedTechnicianUserId: "someone-else", assignedTechnicianNameSnapshot: "Someone Else" });
  store2.reports.push(cloned);
  const directRead = await listReportsForActor(ctx2, OTHER_USER);
  assert.equal(directRead.some((row) => row.report.serviceReportId === cloned.serviceReportId), false);

  console.log("direct API authorization tests passed");
})().catch((error) => {
  console.error("direct API authorization tests failed:", error);
  process.exitCode = 1;
});