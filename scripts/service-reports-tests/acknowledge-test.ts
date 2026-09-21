import assert from "node:assert/strict";
import {
  createOperationContext,
  createOrOpenReport,
  saveDraft,
  markReady,
  acknowledge,
  generatePdfRetry,
} from "../../src/lib/serviceReports/service.ts";
import { sha256HexBuffer } from "../../src/lib/serviceReports/commands.ts";
import { InMemoryServiceReportStore } from "./fake-store.ts";
import { FakeServiceReportDrive, makeInvoice, TECHNICIAN, ADMIN } from "./fake-drive.ts";
import { ServiceReportError } from "../../src/lib/serviceReports/errors.ts";
import type { ServiceReportPdfRenderer } from "../../src/lib/serviceReports/storeTypes.ts";
import type { ServiceReport } from "../../src/types/serviceReport.ts";
import { meaningfulSignaturePng, emptySignaturePng, shortMarkSignaturePng } from "./png-util.ts";

const UUID = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const PDF_RENDERER: ServiceReportPdfRenderer = async (report) => Buffer.from(`FAKE-PDF-${report.serviceReportNo}`, "utf8");

function setup(renderer: ServiceReportPdfRenderer = PDF_RENDERER) {
  const store = new InMemoryServiceReportStore();
  store.invoices.push(makeInvoice());
  const drive = new FakeServiceReportDrive();
  const ctx = createOperationContext(store, drive, { pdfRenderer: renderer });
  return { store, drive, ctx };
}

function ackInput(overrides: Record<string, unknown> = {}) {
  return {
    commandId: UUID(30),
    expectedVersion: 3,
    acknowledgedByFullName: "Juan Dela Cruz",
    acknowledgedByPosition: "Building Administrator",
    consentConfirmed: true,
    signaturePng: meaningfulSignaturePng(),
    ...overrides,
  };
}

async function reachReady(ctx: ReturnType<typeof setup>["ctx"]) {
  const created = await createOrOpenReport(ctx, TECHNICIAN, { commandId: UUID(20), invoiceNo: "1001", reportType: "GENERAL" });
  await saveDraft(ctx, TECHNICIAN, created.report.serviceReportId, {
    reportType: "GENERAL",
    general: {
      commandId: UUID(21),
      expectedVersion: 1,
      serviceDate: "2026-09-20",
      serviceType: "Preventive maintenance",
      fieldReport: "Completed the scheduled maintenance.",
      remarks: "",
      clientAddress: "",
    },
  });
  await markReady(ctx, TECHNICIAN, created.report.serviceReportId, { commandId: UUID(22), expectedVersion: 2 });
  return created.report.serviceReportId;
}

(async () => {
  // 1. Happy path: lock, number, signature metadata, PDF.
  const { store, drive, ctx } = setup();
  const reportId = await reachReady(ctx);
  const result = await acknowledge(ctx, TECHNICIAN, reportId, ackInput());
  assert.equal(result.pdfReady, true);
  assert.equal(result.reused, false);
  assert.equal(result.report.status, "ACKNOWLEDGED");
  assert.match(result.report.serviceReportNo, /^AIC-SR-2026-\d{4}$/);
  assert.equal(result.report.consentConfirmed, true);
  assert.equal(result.report.acknowledgedByFullName, "Juan Dela Cruz");
  assert.equal(result.report.acknowledgedByPosition, "Building Administrator");
  assert.ok(result.report.signedAt);
  assert.equal(result.report.pdfGenerationStatus, "READY");
  assert.ok(result.report.pdfDriveFileId);

  const signaturePng = ackInput().signaturePng as Buffer;
  assert.ok(result.report.signatureDriveFileId);
  assert.match(result.report.signatureUrl, /^\/api\/images\/drive\//);
  assert.equal(result.report.signatureSha256, sha256HexBuffer(signaturePng));
  assert.equal(result.report.signatureMimeType, "image/png");
  assert.equal(result.report.signatureSize, signaturePng.length);

  const stored = store.reports.find((r) => r.serviceReportId === reportId)!;
  assert.equal(stored.status, "ACKNOWLEDGED");
  assert.ok(!JSON.stringify(stored).includes(signaturePng.toString("base64")), "signature base64 must never reach the store");
  assert.equal(drive.files.length, 2, "signature + pdf uploaded");
  assert.equal(drive.files[0].mimeType, "image/png");
  assert.equal(drive.files[1].mimeType, "application/pdf");

  // 2. Idempotent acknowledgment retry: no second number, signature or PDF.
  const { drive: drive2, ctx: ctx2 } = setup();
  const reportId2 = await reachReady(ctx2);
  const first2 = await acknowledge(ctx2, TECHNICIAN, reportId2, ackInput());
  const retried = await acknowledge(ctx2, TECHNICIAN, reportId2, ackInput({ commandId: UUID(31) }));
  assert.equal(retried.reused, true);
  assert.equal(retried.report.serviceReportNo, first2.report.serviceReportNo);
  assert.equal(drive2.files.filter((f) => f.mimeType === "image/png").length, 1, "exactly one signature file");

  const replay = await acknowledge(ctx2, TECHNICIAN, reportId2, ackInput());
  assert.equal(replay.report.serviceReportNo, first2.report.serviceReportNo);

  console.log("acknowledgment tests passed (part 1)");
})().catch((error) => {
  console.error("acknowledgment tests failed:", error);
  process.exitCode = 1;
});
// 3. Empty signature rejection.
(async () => {
  const { ctx: ctx3 } = setup();
  const reportId3 = await reachReady(ctx3);
  const emptyResult = await acknowledge(ctx3, TECHNICIAN, reportId3, ackInput({ signaturePng: emptySignaturePng(), commandId: UUID(32) }))
    .then(() => null, (error: ServiceReportError) => error);
  assert.ok(emptyResult instanceof ServiceReportError);
  assert.equal(emptyResult.errorCode, "VALIDATION");
  assert.match(emptyResult.fieldErrors?.signature ?? "", /empty/i);

  // 4. Accidental short-mark rejection.
  const { ctx: ctx4 } = setup();
  const reportId4 = await reachReady(ctx4);
  const shortResult = await acknowledge(ctx4, TECHNICIAN, reportId4, ackInput({ signaturePng: shortMarkSignaturePng(), commandId: UUID(33) }))
    .then(() => null, (error: ServiceReportError) => error);
  assert.ok(shortResult instanceof ServiceReportError);
  assert.equal(shortResult.errorCode, "VALIDATION");
  assert.match(shortResult.fieldErrors?.signature ?? "", /too short/i);

  // 5. Consent requirement.
  const { ctx: ctx5 } = setup();
  const reportId5 = await reachReady(ctx5);
  const noConsent = await acknowledge(ctx5, TECHNICIAN, reportId5, ackInput({ consentConfirmed: false, commandId: UUID(34) }))
    .then(() => null, (error: ServiceReportError) => error);
  assert.ok(noConsent instanceof ServiceReportError);
  assert.equal(noConsent.errorCode, "VALIDATION");
  assert.match(noConsent.fieldErrors?.consentConfirmed ?? "", /checked/i);

  // 6. Signature upload compensation on authoritative DB failure.
  const failStore = new InMemoryServiceReportStore();
  failStore.invoices.push(makeInvoice());
  const failDrive = new FakeServiceReportDrive();
  const failCtx = createOperationContext(failStore, failDrive, { pdfRenderer: PDF_RENDERER });
  const failReportId = await reachReady(failCtx);
  failStore.failNextUpdate = true;
  const dbFailure = await acknowledge(failCtx, TECHNICIAN, failReportId, ackInput())
    .then(() => null, (error: Error) => error);
  assert.ok(dbFailure instanceof Error);
  assert.match(dbFailure.message, /simulated authoritative database failure/);
  assert.equal(failDrive.deleted.length, 1, "the uploaded signature must be deleted when the DB write fails");
  assert.equal(failDrive.files.length, 0);
  const unchanged = failStore.reports.find((r) => r.serviceReportId === failReportId)!;
  assert.equal(unchanged.status, "READY_FOR_ACKNOWLEDGMENT");

// 7. PDF failure recovery: acknowledgment preserved, PDF_FAILED, admin retry.
(async () => {
  const failingRenderer: ServiceReportPdfRenderer = async () => { throw new Error("render engine crashed"); };
  const { ctx: ctx7 } = setup(failingRenderer);
  const reportId = await reachReady(ctx7);
  const failed = await acknowledge(ctx7, TECHNICIAN, reportId, ackInput());
  assert.equal(failed.pdfReady, false);
  assert.ok(failed.pdfWarning);
  assert.equal(failed.report.status, "PDF_FAILED");
  assert.equal(failed.report.pdfGenerationStatus, "FAILED");
  assert.match(failed.report.serviceReportNo, /^AIC-SR-2026-\d{4}$/, "number is allocated at acknowledgment");
  assert.equal(failed.report.acknowledgedByFullName, "Juan Dela Cruz", "acknowledgment is preserved");

  // The retried acknowledgment must not allocate a second number.
  const retried = await acknowledge(ctx7, TECHNICIAN, reportId, ackInput({ commandId: UUID(35) }));
  assert.equal(retried.reused, true);
  assert.equal(retried.report.serviceReportNo, failed.report.serviceReportNo);

  // Admin retries the PDF against the preserved signature.
  const { drive: drive7, store: store7b } = setup(PDF_RENDERER);
  const retryCtx = createOperationContext(store7b, drive7, { pdfRenderer: PDF_RENDERER });
  const retryResult = await generatePdfRetry(retryCtx, TECHNICIAN, reportId, { commandId: UUID(36), expectedVersion: failed.report.version })
    .catch((error) => error);
  // The failure context and retry context are different stores, so version 0
  // rows differ; instead run retry inside the SAME failing store after swapping
  // in a working renderer.
  void retryResult;

  const recovery = await (async () => {
    const storeR = new InMemoryServiceReportStore();
    storeR.invoices.push(makeInvoice());
    const driveR = new FakeServiceReportDrive();
    let failPdf = false;
    const renderer: ServiceReportPdfRenderer = async (report: ServiceReport) => {
      if (failPdf) throw new Error("render engine crashed");
      return Buffer.from(`PDF-${report.serviceReportNo}`, "utf8");
    };
    const ctxR = createOperationContext(storeR, driveR, { pdfRenderer: renderer });
    const idR = await reachReady(ctxR);
    failPdf = true;
    const firstAck = await acknowledge(ctxR, TECHNICIAN, idR, ackInput());
    assert.equal(firstAck.report.status, "PDF_FAILED");
    failPdf = false;
    const retry = await generatePdfRetry(ctxR, ADMIN, idR, { commandId: UUID(37), expectedVersion: firstAck.report.version });
    assert.equal(retry.report.status, "ACKNOWLEDGED");
    assert.equal(retry.report.pdfGenerationStatus, "READY");
    assert.equal(retry.report.serviceReportNo, firstAck.report.serviceReportNo);
    assert.equal(retry.report.acknowledgedByFullName, "Juan Dela Cruz");
    const sigCount = driveR.files.filter((f) => f.mimeType === "image/png").length;
    assert.equal(sigCount, 1, "retry must not re-upload a signature");
    return retry;
  })();
  assert.ok(recovery.report.pdfDriveFileId);

  console.log("acknowledgment tests passed (part 3)");
})().catch((error) => {
  console.error("acknowledgment tests failed:", error);
  process.exitCode = 1;
});
  console.log("acknowledgment tests passed (part 2)");
})().catch((error) => {
  console.error("acknowledgment tests failed:", error);
  process.exitCode = 1;
});