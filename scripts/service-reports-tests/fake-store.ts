// In-memory fake for the ServiceReportStore port. Implements the SAME contract
// the orchestration layer depends on, so focused tests exercise the real
// service code (not a private re-implementation).

import type {
  ServiceReport,
  ServiceReportHistoryEvent,
  ServiceReportCommandReceipt,
  ServiceReportSequence,
  ServiceInvoiceCoarseRow,
  WaterTreatmentServiceReportDetails,
} from "../../src/types/serviceReport.ts";
import type { ServiceReportStore } from "../../src/lib/serviceReports/storeTypes.ts";
import { ServiceReportError, versionConflict } from "../../src/lib/serviceReports/errors.ts";

export interface InMemoryOptions {
  /** Simulate the signed-row write failing (acknowledgment compensation). */
  failNextUpdate?: boolean;
}

export class InMemoryServiceReportStore implements ServiceReportStore {
  reports: ServiceReport[] = [];
  invoices: ServiceInvoiceCoarseRow[] = [];
  history: ServiceReportHistoryEvent[] = [];
  commands: ServiceReportCommandReceipt[] = [];
  sequences = new Map<string, ServiceReportSequence>();
  waterTreatmentDetails = new Map<string, WaterTreatmentServiceReportDetails>();
  failNextUpdate = false;

  constructor(options: InMemoryOptions = {}) {
    this.failNextUpdate = options.failNextUpdate ?? false;
  }

  async listInvoices(): Promise<ServiceInvoiceCoarseRow[]> {
    return this.invoices.map((invoice) => ({ ...invoice }));
  }

  async listReports(): Promise<ServiceReport[]> {
    return this.reports.map((report) => ({ ...report }));
  }

  async getReport(serviceReportId: string): Promise<ServiceReport | null> {
    const report = this.reports.find((r) => r.serviceReportId === serviceReportId);
    return report ? { ...report } : null;
  }

  async findReportByInvoiceNo(invoiceNo: string): Promise<ServiceReport | null> {
    const report = this.reports.find(
      (r) => r.serviceInvoiceNo === invoiceNo && r.status !== "VOID",
    );
    return report ? { ...report } : null;
  }

  async listHistory(serviceReportId: string): Promise<ServiceReportHistoryEvent[]> {
    return this.history.filter((event) => event.serviceReportId === serviceReportId).map((event) => ({ ...event }));
  }

  async listCommands(): Promise<ServiceReportCommandReceipt[]> {
    return this.commands.map((command) => ({ ...command }));
  }

  async getSequence(businessYear: string): Promise<ServiceReportSequence | null> {
    const sequence = this.sequences.get(`AIC-SR-${businessYear}`);
    return sequence ? { ...sequence } : null;
  }

  async allocateReportNumber(businessYear: string): Promise<{ reportNo: string; lastNumber: number }> {
    const key = `AIC-SR-${businessYear}`;
    const current = this.sequences.get(key);
    const lastNumber = (current?.lastNumber ?? 0) + 1;
    this.sequences.set(key, {
      sequenceKey: key,
      prefix: "AIC-SR",
      businessYear,
      lastNumber,
      updatedAt: "2026-09-20T00:00:00.000Z",
    });
    return { reportNo: `AIC-SR-${businessYear}-${String(lastNumber).padStart(4, "0")}`, lastNumber };
  }

  async createReport(report: ServiceReport): Promise<void> {
    const duplicate = this.reports.some(
      (r) => r.serviceInvoiceNo === report.serviceInvoiceNo && r.status !== "VOID",
    );
    if (duplicate) {
      throw new ServiceReportError(
        { code: "DUPLICATE", message: `A Service Report already exists for invoice ${report.serviceInvoiceNo}.` },
        409,
      );
    }
    this.reports.push({ ...report });
  }

  async updateReport(report: ServiceReport, expectedVersion: number): Promise<void> {
    const index = this.reports.findIndex((r) => r.serviceReportId === report.serviceReportId);
    if (index < 0) {
      throw new ServiceReportError({ code: "DEPENDENCY_UNAVAILABLE", message: "report not found", retryable: true }, 503);
    }
    const current = this.reports[index];
    if (current.version !== expectedVersion) {
      throw versionConflict(
        `This report was changed by another save (expected version ${expectedVersion}, current version ${current.version}).`,
        current.version,
      );
    }
    if (this.failNextUpdate) {
      this.failNextUpdate = false;
      throw new Error("simulated authoritative database failure");
    }
    this.reports[index] = { ...report };
  }

  async deleteReport(serviceReportId: string): Promise<void> {
    this.reports = this.reports.filter((r) => r.serviceReportId !== serviceReportId);
  }

  async getWaterTreatmentDetails(serviceReportId: string): Promise<WaterTreatmentServiceReportDetails | null> {
    const details = this.waterTreatmentDetails.get(serviceReportId);
    return details ? { ...details } : null;
  }

  async createWaterTreatmentDetails(details: WaterTreatmentServiceReportDetails): Promise<void> {
    if (this.waterTreatmentDetails.has(details.serviceReportId)) {
      throw new ServiceReportError(
        { code: "DUPLICATE", message: "A Water Treatment details row already exists for this report." },
        409,
      );
    }
    this.waterTreatmentDetails.set(details.serviceReportId, { ...details });
  }

  async updateWaterTreatmentDetails(details: WaterTreatmentServiceReportDetails): Promise<void> {
    this.waterTreatmentDetails.set(details.serviceReportId, { ...details });
  }

  async deleteWaterTreatmentDetails(serviceReportId: string): Promise<void> {
    this.waterTreatmentDetails.delete(serviceReportId);
  }

  async appendHistory(event: ServiceReportHistoryEvent): Promise<void> {
    this.history.push({ ...event });
  }

  async saveCommand(receipt: ServiceReportCommandReceipt): Promise<void> {
    this.commands.push({ ...receipt });
  }
}