import assert from "node:assert/strict";
import {
  parseCreateReportInput,
  parseSaveDraftInput,
  parseExpectedVersionInput,
  parseVoidReportInput,
  parseAcknowledgeMultipart,
  isUuid,
} from "../../src/lib/serviceReports/validation.ts";
import type { ValidatedSaveDraft } from "../../src/lib/serviceReports/validation.ts";
import { meaningfulSignaturePng } from "./png-util.ts";

const generalOf = (value: ValidatedSaveDraft) => {
  if (value.reportType !== "GENERAL") throw new Error("expected a GENERAL validated draft");
  return value.general;
};
const waterTreatmentOf = (value: ValidatedSaveDraft) => {
  if (value.reportType !== "WATER_TREATMENT") throw new Error("expected a WATER_TREATMENT validated draft");
  return value.waterTreatment;
};

const UUID = "00000000-0000-4000-8000-000000000001";
assert.equal(isUuid(UUID), true);
assert.equal(isUuid("not-a-uuid"), false);

const created = parseCreateReportInput({ commandId: UUID, invoiceNo: "1001", reportType: "GENERAL" });
assert.equal(created.invoiceNo, "1001");
assert.equal(created.reportType, "GENERAL");
assert.equal(parseCreateReportInput({ commandId: UUID, invoiceNo: "1001", reportType: "WATER_TREATMENT" }).reportType, "WATER_TREATMENT");
assert.throws(() => parseCreateReportInput({ commandId: UUID, invoiceNo: "1001", reportType: "AERICH" }), /create-report payload/);
assert.throws(() => parseCreateReportInput({ commandId: UUID, invoiceNo: "1001", reportType: "water_treatment" }), /create-report payload/);
assert.throws(() => parseCreateReportInput({ commandId: UUID }), /create-report payload/);
assert.throws(() => parseCreateReportInput({ commandId: "x", invoiceNo: "1" }), /create-report payload/);
assert.throws(() => parseCreateReportInput(null), /JSON object/);

const validDraft = generalOf(parseSaveDraftInput({
  commandId: UUID, expectedVersion: 1, serviceDate: "2026-09-20",
  serviceType: "Preventive maintenance", fieldReport: "Completed maintenance.", remarks: "", clientAddress: "",
}, "GENERAL"));
assert.equal(validDraft.serviceType, "Preventive maintenance");

function parseError(fn: () => unknown) {
  try { fn(); return null; } catch (error: any) { return error; }
}

const noType = parseError(() => parseSaveDraftInput({ commandId: UUID, expectedVersion: 1, serviceDate: "2026-09-20", serviceType: "", fieldReport: "done", remarks: "", clientAddress: "" }, "GENERAL"));
assert.ok(noType);
assert.equal(noType.errorCode, "VALIDATION");
assert.ok(noType.fieldErrors?.serviceType);

const noFieldReport = parseError(() => parseSaveDraftInput({ commandId: UUID, expectedVersion: 1, serviceDate: "2026-09-20", serviceType: "Repair", fieldReport: "", remarks: "", clientAddress: "" }, "GENERAL"));
assert.ok(noFieldReport);
assert.ok(noFieldReport.fieldErrors?.fieldReport);

const badDate = parseError(() => parseSaveDraftInput({ commandId: UUID, expectedVersion: 1, serviceDate: "20-09-2026", serviceType: "Repair", fieldReport: "done", remarks: "", clientAddress: "" }, "GENERAL"));
assert.ok(badDate);
assert.ok(badDate.fieldErrors?.serviceDate);

// A GENERAL report rejects Water Treatment payload content.
const generalRejectsWt = parseError(() => parseSaveDraftInput({
  commandId: UUID, expectedVersion: 1, serviceDate: "2026-09-20", serviceType: "Repair",
  fieldReport: "done", remarks: "", clientAddress: "", waterTreatmentDetails: { emailAddress: "a@b.c" },
}, "GENERAL"));
assert.ok(generalRejectsWt);
assert.ok(generalRejectsWt.fieldErrors?.waterTreatmentDetails);

// reportType is immutable inside PATCH bodies.
const patchTriesTypeChange = parseError(() => parseSaveDraftInput({
  commandId: UUID, expectedVersion: 1, serviceDate: "2026-09-20", serviceType: "Repair",
  fieldReport: "done", remarks: "", clientAddress: "", reportType: "WATER_TREATMENT",
}, "GENERAL"));
assert.ok(patchTriesTypeChange);
assert.ok(patchTriesTypeChange.fieldErrors?.reportType);

// WATER_TREATMENT rejects the General FieldReport as the work record.
const wtRejectsFieldReport = parseError(() => parseSaveDraftInput({
  commandId: UUID, expectedVersion: 1, serviceDate: "2026-09-20", serviceType: "PM",
  clientName: "Acme", clientAddress: "", fieldReport: "general content",
  waterTreatmentDetails: { emailAddress: "tech@example.com" },
}, "WATER_TREATMENT"));
assert.ok(wtRejectsFieldReport);
assert.ok(wtRejectsFieldReport.fieldErrors?.fieldReport);

// WATER_TREATMENT requires the nested waterTreatmentDetails payload.
const wtRequiresDetails = parseError(() => parseSaveDraftInput({
  commandId: UUID, expectedVersion: 1, serviceDate: "2026-09-20", serviceType: "PM",
  clientName: "Acme", clientAddress: "",
}, "WATER_TREATMENT"));
assert.ok(wtRequiresDetails);
assert.ok(wtRequiresDetails.fieldErrors?.waterTreatmentDetails);

// Email is validated as a trimmed address.
const badEmail = parseError(() => parseSaveDraftInput({
  commandId: UUID, expectedVersion: 1, serviceDate: "2026-09-20", serviceType: "PM",
  clientName: "Acme", clientAddress: "",
  waterTreatmentDetails: { emailAddress: "not-an-email" },
}, "WATER_TREATMENT"));
assert.ok(badEmail);
assert.ok(badEmail.fieldErrors?.emailAddress);

// Measurement blanks stay blank; literal zero is preserved; N/A is allowed.
const trimmedMeasurements = waterTreatmentOf(parseSaveDraftInput({
  commandId: UUID, expectedVersion: 1, serviceDate: "2026-09-20", serviceType: "PM",
  clientName: "Acme", clientAddress: "",
  waterTreatmentDetails: { emailAddress: "tech@example.com", feedTdsBefore: "0", feedTdsAfter: "", preFilterInletPressureBefore: "N/A" },
}, "WATER_TREATMENT")).waterTreatmentDetails;
assert.equal(trimmedMeasurements.feedTdsBefore, "0");
assert.equal(trimmedMeasurements.feedTdsAfter, "");
assert.equal(trimmedMeasurements.preFilterInletPressureBefore, "N/A");

// Equipment statuses accept exactly WORKING or DEFECTIVE.
const equipment = waterTreatmentOf(parseSaveDraftInput({
  commandId: UUID, expectedVersion: 1, serviceDate: "2026-09-20", serviceType: "PM",
  clientName: "Acme", clientAddress: "",
  waterTreatmentDetails: { emailAddress: "tech@example.com", rawTankStatus: "WORKING", uvLightStatus: "DEFECTIVE" },
}, "WATER_TREATMENT")).waterTreatmentDetails;
assert.equal(equipment.rawTankStatus, "WORKING");
assert.equal(equipment.uvLightStatus, "DEFECTIVE");
const badEquipment = parseError(() => parseSaveDraftInput({
  commandId: UUID, expectedVersion: 1, serviceDate: "2026-09-20", serviceType: "PM",
  clientName: "Acme", clientAddress: "",
  waterTreatmentDetails: { emailAddress: "tech@example.com", rawTankStatus: "OPERATIONAL" },
}, "WATER_TREATMENT"));
assert.ok(badEquipment);
assert.ok(badEquipment.fieldErrors?.rawTankStatus);

// Water samples are FREE TEXT (not Working/Defective selectors).
const samples = waterTreatmentOf(parseSaveDraftInput({
  commandId: UUID, expectedVersion: 1, serviceDate: "2026-09-20", serviceType: "PM",
  clientName: "Acme", clientAddress: "",
  waterTreatmentDetails: {
    emailAddress: "tech@example.com",
    microbiologicalWaterSampleResult: "No growth observed",
    physicalChemicalWaterSampleResult: "pH 7.2, TDS 45",
  },
}, "WATER_TREATMENT")).waterTreatmentDetails;
assert.equal(samples.microbiologicalWaterSampleResult, "No growth observed");
assert.equal(samples.physicalChemicalWaterSampleResult, "pH 7.2, TDS 45");

assert.equal(parseExpectedVersionInput({ commandId: UUID, expectedVersion: 4 }).expectedVersion, 4);
assert.throws(() => parseExpectedVersionInput({ expectedVersion: 4 }), /Invalid payload/);

assert.equal(parseVoidReportInput({ commandId: UUID, expectedVersion: 3, reason: "Duplicate invoice" }).reason, "Duplicate invoice");
const noVoidReason = parseError(() => parseVoidReportInput({ commandId: UUID, expectedVersion: 3, reason: "" }));
assert.ok(noVoidReason);
assert.ok(noVoidReason.fieldErrors?.reason);

// â”€â”€ Multipart acknowledgment parsing (async) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
(async () => {
  const png = Uint8Array.from(meaningfulSignaturePng());

  async function makeForm(overrides: Record<string, string | File | null> = {}): Promise<FormData> {
    const form = new FormData();
    form.set("commandId", UUID);
    form.set("expectedVersion", "1");
    form.set("acknowledgedByFullName", "Juan Dela Cruz");
    form.set("acknowledgedByPosition", "Building Administrator");
    form.set("consentConfirmed", "true");
    form.set("signature", new File([png], "signature.png", { type: "image/png" }));
    for (const [key, value] of Object.entries(overrides)) {
      if (value === null) form.delete(key);
      else form.set(key, value);
    }
    return form;
  }

  const ack = await parseAcknowledgeMultipart(await makeForm());
  assert.equal(ack.acknowledgedByFullName, "Juan Dela Cruz");
  assert.equal(ack.acknowledgedByPosition, "Building Administrator");
  assert.equal(ack.consentConfirmed, true);
  assert.ok(ack.signaturePng.length > 0);
  assert.equal(ack.expectedVersion, 1);

  async function ackError(formOverrides: Record<string, string | File | null>) {
    try {
      await parseAcknowledgeMultipart(await makeForm(formOverrides));
      return null;
    } catch (error: any) {
      return error;
    }
  }

  const noConsentAsync = await ackError({ consentConfirmed: "false" });
  assert.ok(noConsentAsync);
  assert.ok(noConsentAsync.fieldErrors?.consentConfirmed);

  const noNameAsync = await ackError({ acknowledgedByFullName: "" });
  assert.ok(noNameAsync);
  assert.ok(noNameAsync.fieldErrors?.acknowledgedByFullName);

  const noSignatureAsync = await ackError({ signature: null });
  assert.ok(noSignatureAsync);
  assert.ok(noSignatureAsync.fieldErrors?.signature);

  console.log("validation tests passed");
})().catch((error) => {
  console.error("validation tests failed:", error);
  process.exitCode = 1;
});