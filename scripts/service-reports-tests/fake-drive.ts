// In-memory fake Drive + shared builders/actors for Service Report tests.

import type {
  ServiceReport,
  ServiceInvoiceCoarseRow,
} from "../../src/types/serviceReport.ts";
import type { ServiceReportDrive } from "../../src/lib/serviceReports/storeTypes.ts";

export interface StoredFakeFile {
  fileId: string;
  fileName: string;
  mimeType: string;
  buffer: Buffer;
}

export class FakeServiceReportDrive implements ServiceReportDrive {
  files: StoredFakeFile[] = [];
  deleted: string[] = [];
  private counter = 0;

  async uploadPrivateFile(input: {
    fileName: string;
    mimeType: string;
    buffer: Buffer;
    description?: string;
  }): Promise<{ fileId: string; url: string }> {
    this.counter += 1;
    const fileId = `drive-file-${this.counter}`;
    this.files.push({
      fileId,
      fileName: input.fileName,
      mimeType: input.mimeType,
      buffer: Buffer.from(input.buffer),
    });
    return { fileId, url: `/api/images/drive/${fileId}` };
  }

  async deleteFile(fileId: string): Promise<void> {
    this.deleted.push(fileId);
    this.files = this.files.filter((file) => file.fileId !== fileId);
  }

  async fetchFileBase64(fileId: string): Promise<string> {
    const file = this.files.find((entry) => entry.fileId === fileId);
    if (!file) throw new Error(`drive file ${fileId} not found`);
    return file.buffer.toString("base64");
  }
}

export function makeInvoice(overrides: Partial<ServiceInvoiceCoarseRow> = {}): ServiceInvoiceCoarseRow {
  return {
    invoiceNo: "1001",
    customerId: "CUS-1",
    companyName: "Acme Corporation",
    address: "123 Main St",
    assignedTechnicianUserId: "tech-1",
    assignedTechnicianName: "Tech One",
    serviceReportId: "",
    serviceReportStatus: "",
    ...overrides,
  };
}

export function makeDraftReport(serviceReportId: string, invoiceNo = "1001", overrides: Partial<ServiceReport> = {}): ServiceReport {
  return {
    serviceReportId,
    reportType: "GENERAL",
    serviceReportNo: "",
    serviceInvoiceNo: invoiceNo,
    customerId: "CUS-1",
    companyNameSnapshot: "Acme Corporation",
    clientNameSnapshot: "Acme Corporation",
    clientAddressSnapshot: "123 Main St",
    assignedTechnicianUserId: "tech-1",
    assignedTechnicianNameSnapshot: "Tech One",
    serviceDate: "2026-09-20",
    serviceType: "Preventive maintenance",
    fieldReport: "Completed the scheduled maintenance.",
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
    createdAt: "2026-09-20T00:00:00.000Z",
    createdBy: "tech-1",
    updatedAt: "2026-09-20T00:00:00.000Z",
    updatedBy: "tech-1",
    ...overrides,
  };
}

export const TECHNICIAN = { userId: "tech-1", userRoleId: 2, fullName: "Tech One" };
export const OTHER_USER = { userId: "other-1", userRoleId: 2, fullName: "Other User" };
export const ADMIN = { userId: "admin-1", userRoleId: 1, fullName: "Admin One" };

export function newUuidLike(seed: number): string {
  return `00000000-0000-4000-8000-${String(seed).padStart(12, "0")}`;
}