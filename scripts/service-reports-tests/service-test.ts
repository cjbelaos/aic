import assert from "node:assert/strict";
import { createOperationContext, createOrOpenReport, saveDraft, markReady, voidReport, getReportDetail } from "../../src/lib/serviceReports/service.ts";
import { InMemoryServiceReportStore } from "./fake-store.ts";
import { FakeServiceReportDrive, makeInvoice, makeDraftReport, TECHNICIAN, OTHER_USER, ADMIN } from "./fake-drive.ts";
import { ServiceReportError } from "../../src/lib/serviceReports/errors.ts";

const UUID = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const DRAFT_FIELDS = { serviceDate: "2026-09-20", serviceType: "Repair", fieldReport: "Replaced the motor.", remarks: "", clientAddress: "" };
const draftFields = (over: Partial<typeof DRAFT_FIELDS> = {}) => ({ ...DRAFT_FIELDS, ...over });

function freshContext() {
  const store = new InMemoryServiceReportStore();
  store.invoices.push(makeInvoice());
  const ctx = createOperationContext(store, new FakeServiceReportDrive(), {});
  return { store, ctx };
}

type AnyActor = typeof TECHNICIAN | typeof OTHER_USER | typeof ADMIN;
const createGeneral = (
  ctx: ReturnType<typeof freshContext>["ctx"],
  actor: AnyActor,
  commandId: string,
  invoiceNo = "1001",
) => createOrOpenReport(ctx, actor, { commandId, invoiceNo, reportType: "GENERAL" });

const saveGeneral = (
  ctx: ReturnType<typeof freshContext>["ctx"],
  actor: AnyActor,
  reportId: string,
  commandId: string,
  expectedVersion: number,
  over: Partial<typeof DRAFT_FIELDS> = {},
) => saveDraft(ctx, actor, reportId, {
  reportType: "GENERAL",
  general: { commandId, expectedVersion, ...draftFields(over) },
});

(async () => {
  const { ctx, store } = freshContext();
  const first = await createGeneral(ctx, TECHNICIAN, UUID(1));
  assert.equal(first.reusedExisting, false);
  assert.equal(first.report.status, "DRAFT");
  assert.equal(first.report.reportType, "GENERAL");
  assert.equal(first.report.companyNameSnapshot, "Acme Corporation");
  assert.equal(first.report.clientAddressSnapshot, "123 Main St");
  assert.equal(first.report.assignedTechnicianNameSnapshot, "Tech One");
  assert.equal(first.report.serviceReportNo, "");
  assert.equal(first.report.version, 1);
  assert.equal(store.history.some((event) => event.eventType === "REPORT_CREATED"), true);

  // Repeated creation returns the same report (duplicate prevention).
  const reopened = await createGeneral(ctx, TECHNICIAN, UUID(2));
  assert.equal(reopened.reusedExisting, true);
  assert.equal(reopened.report.serviceReportId, first.report.serviceReportId);

  // Idempotent create retry with the SAME commandId replays (no extra history).
  const historyCount = store.history.length;
  const replayed = await createGeneral(ctx, TECHNICIAN, UUID(1));
  assert.equal(replayed.report.serviceReportId, first.report.serviceReportId);
  assert.equal(store.history.length, historyCount, "replay must not append history");

  const { ctx: raceCtx } = freshContext();
  await createGeneral(raceCtx, TECHNICIAN, UUID(3));
  const reopenedAfterRace = await createGeneral(raceCtx, TECHNICIAN, UUID(4));
  assert.equal(reopenedAfterRace.reusedExisting, true);

  const { ctx: ctx2, store: store2 } = freshContext();
  const draft = await createGeneral(ctx2, TECHNICIAN, UUID(5));
  const savedOk = await saveGeneral(ctx2, TECHNICIAN, draft.report.serviceReportId, UUID(6), 1, { remarks: "Follow-up visit recommended.", clientAddress: "456 Side Rd" });
  assert.equal(savedOk.version, 2);
  assert.equal(savedOk.remarks, "Follow-up visit recommended.");

  // Draft expected-version conflict returns the current version.
  const conflict = await saveGeneral(ctx2, TECHNICIAN, draft.report.serviceReportId, UUID(7), 1, { fieldReport: "stale content" })
    .then(() => null, (error: ServiceReportError) => error);
  assert.ok(conflict instanceof ServiceReportError);
  assert.equal(conflict.errorCode, "VERSION_CONFLICT");
  assert.equal(conflict.currentVersion, 2);
  assert.equal(conflict.status, 409);

  // Unrelated user cannot edit; admin can.
  const forbiddenEdit = await saveGeneral(ctx2, OTHER_USER, draft.report.serviceReportId, UUID(8), 2, { fieldReport: "hijack" })
    .then(() => null, (error: ServiceReportError) => error);
  assert.ok(forbiddenEdit instanceof ServiceReportError);
  assert.equal(forbiddenEdit.status, 403);
  await saveGeneral(ctx2, ADMIN, draft.report.serviceReportId, UUID(9), 2, { fieldReport: "Replaced the motor (admin edit)." });

  // Ready transition; then a signed report becomes read-only.
  const ready = await markReady(ctx2, TECHNICIAN, draft.report.serviceReportId, { commandId: UUID(10), expectedVersion: 3 });
  assert.equal(ready.status, "READY_FOR_ACKNOWLEDGMENT");
  assert.equal(ready.version, 4);
  const badReady = await markReady(ctx2, TECHNICIAN, draft.report.serviceReportId, { commandId: UUID(11), expectedVersion: 4 })
    .then(() => null, (error: ServiceReportError) => error);
  assert.ok(badReady instanceof ServiceReportError);
// A signed report is locked: content edits are rejected with 403.
  const acked = makeDraftReport(draft.report.serviceReportId, "1001", { status: "ACKNOWLEDGED", version: 5 });
  const idx = store2.reports.findIndex((r) => r.serviceReportId === draft.report.serviceReportId);
  store2.reports[idx] = acked;
  const editLocked = await saveGeneral(ctx2, TECHNICIAN, draft.report.serviceReportId, UUID(13), 5, { fieldReport: "nope" })
    .then(() => null, (error: ServiceReportError) => error);
  assert.ok(editLocked instanceof ServiceReportError);
  assert.equal(editLocked.status, 403);
  assert.match(editLocked.message, /cannot be edited/);

  // Void is admin-only.
  const voidDenied = await voidReport(ctx2, TECHNICIAN, draft.report.serviceReportId, { commandId: UUID(14), expectedVersion: 5, reason: "try anyway" })
    .then(() => null, (error: ServiceReportError) => error);
  assert.ok(voidDenied instanceof ServiceReportError);
  assert.equal(voidDenied.status, 403);
  const voided = await voidReport(ctx2, ADMIN, draft.report.serviceReportId, { commandId: UUID(15), expectedVersion: 5, reason: "Duplicate submission" });
  assert.equal(voided.status, "VOID");
  assert.equal(voided.voidReason, "Duplicate submission");
  assert.equal(voided.version, 6);

  const detail = await getReportDetail(ctx2, TECHNICIAN, draft.report.serviceReportId);
  assert.equal(detail.report.status, "VOID");
  const detailDenied = await getReportDetail(ctx2, OTHER_USER, draft.report.serviceReportId)
    .then(() => null, (error: ServiceReportError) => error);
  assert.ok(detailDenied instanceof ServiceReportError);
  assert.equal(detailDenied.status, 403);

  console.log("service tests passed");
})().catch((error) => {
  console.error("service tests failed:", error);
  process.exitCode = 1;
});