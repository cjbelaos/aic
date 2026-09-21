import assert from "node:assert/strict";
import {
  canAccessReport,
  canModifyReport,
  canAdministerReport,
} from "../../src/lib/serviceReports/permissions.ts";
import { createOperationContext, createOrOpenReport } from "../../src/lib/serviceReports/service.ts";
import { InMemoryServiceReportStore } from "./fake-store.ts";
import { FakeServiceReportDrive, makeInvoice, makeDraftReport, TECHNICIAN, OTHER_USER, ADMIN } from "./fake-drive.ts";
import { ServiceReportError } from "../../src/lib/serviceReports/errors.ts";

// Object-level authorization: admin / assigned technician / unrelated user.
const report = makeDraftReport("report-1");
const invoice = makeInvoice();

assert.equal(canAccessReport(ADMIN, report, invoice).allowed, true);
assert.equal(canAccessReport(TECHNICIAN, report, invoice).allowed, true);
const denied = canAccessReport(OTHER_USER, report, invoice);
assert.equal(denied.allowed, false);
assert.match(denied.reason ?? "", /assigned technician or an admin/);

// Technicians may edit drafts only.
assert.equal(canModifyReport(TECHNICIAN, report, invoice).allowed, true);
assert.equal(canModifyReport(ADMIN, report, invoice).allowed, true);
const locked = canModifyReport(TECHNICIAN, { ...report, status: "ACKNOWLEDGED" as const }, invoice);
assert.equal(locked.allowed, false);
assert.match(locked.reason ?? "", /cannot be edited/);

// Admin-only actions
assert.equal(canAdministerReport(ADMIN).allowed, true);
assert.equal(canAdministerReport(TECHNICIAN).allowed, false);

// Missing technician assignment blocks creation with the exact message.
async function attemptCreateWith(missingTechnician: boolean) {
  const store = new InMemoryServiceReportStore();
  store.invoices.push(makeInvoice({ assignedTechnicianUserId: missingTechnician ? "" : "tech-1", assignedTechnicianName: missingTechnician ? "" : "Tech One" }));
  const drive = new FakeServiceReportDrive();
  const ctx = createOperationContext(store, drive, {});
  return createOrOpenReport(ctx, TECHNICIAN, { commandId: "00000000-0000-4000-8000-000000000010", invoiceNo: "1001", reportType: "GENERAL" });
}

(async () => {
  const created = await attemptCreateWith(false);
  assert.equal(created.report.status, "DRAFT");
  assert.equal(created.report.assignedTechnicianNameSnapshot, "Tech One");

  const blocked = await attemptCreateWith(true).then(
    () => null,
    (error: ServiceReportError) => error,
  );
  assert.ok(blocked instanceof ServiceReportError);
  assert.equal(blocked.errorCode, "VALIDATION");
  assert.equal(blocked.fieldErrors?.assignedTechnicianUserId, "Assign a technician before creating a Service Report.");

  // Unrelated user receives 403 (through the same code paths the routes use).
  const store = new InMemoryServiceReportStore();
  store.invoices.push(makeInvoice());
  const drive = new FakeServiceReportDrive();
  const ctx = createOperationContext(store, drive, {});
  const forbiddenError = await createOrOpenReport(ctx, OTHER_USER, {
    commandId: "00000000-0000-4000-8000-000000000011",
    invoiceNo: "1001",
    reportType: "GENERAL",
  }).then(() => null, (error: ServiceReportError) => error);
  assert.ok(forbiddenError instanceof ServiceReportError);
  assert.equal(forbiddenError.status, 403);
  assert.equal(forbiddenError.errorCode, "FORBIDDEN");

  // Admin may always create.
  const adminResult = await createOrOpenReport(
    createOperationContext(store, drive, {}),
    ADMIN,
    { commandId: "00000000-0000-4000-8000-000000000012", invoiceNo: "1001", reportType: "GENERAL" },
  );
  assert.equal(adminResult.report.status, "DRAFT");

  console.log("authorization tests passed");
})().catch((error) => {
  console.error("authorization tests failed:", error);
  process.exitCode = 1;
});