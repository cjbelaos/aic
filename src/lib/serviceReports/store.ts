// Service Reports — real Google Sheets store binding. This module wires the
// repository/writer/sequences modules into the ServiceReportStore interface the
// orchestration layer depends on, so route handlers stay thin.

import type { ServiceReportStore } from "./storeTypes";
import {
  readServiceReports,
  readServiceReportById,
  findServiceReportByInvoiceNo,
  readServiceReportHistory,
  readServiceReportCommands,
  listServiceInvoiceRows,
  readWaterTreatmentDetails,
} from "./repository";
import {
  createServiceReport,
  updateServiceReport,
  deleteServiceReport,
  upsertWaterTreatmentDetails,
  deleteWaterTreatmentDetails,
  appendServiceReportHistory,
  saveServiceReportCommand,
  readServiceReportSequence,
  writeServiceReportSequence,
  readServiceReportLock,
  writeServiceReportLock,
} from "./writer";
import { allocateSerializedReportNumber } from "./sequences";
import type { ServiceReportSequence } from "@/types/serviceReport";

export function createSheetsServiceReportStore(): ServiceReportStore {
  return {
    listInvoices: () => listServiceInvoiceRows(),
    listReports: () => readServiceReports(),
    getReport: (id) => readServiceReportById(id),
    findReportByInvoiceNo: (invoiceNo) => findServiceReportByInvoiceNo(invoiceNo),
    listHistory: (id) => readServiceReportHistory(id),
    listCommands: () => readServiceReportCommands(),
    getSequence: (businessYear) => readServiceReportSequence(businessYear),
    allocateReportNumber: (businessYear) =>
      allocateSerializedReportNumber({
        lockStore: {
          readLock: readServiceReportLock,
          writeLock: writeServiceReportLock,
        },
        sequenceStore: {
          readSequence: readServiceReportSequence,
          writeSequence: (sequence: ServiceReportSequence) => writeServiceReportSequence(sequence),
        },
        businessYear,
      }),
    createReport: (report) => createServiceReport(report),
    updateReport: (report, expectedVersion) => updateServiceReport(report, expectedVersion),
    deleteReport: (serviceReportId) => deleteServiceReport(serviceReportId),
    getWaterTreatmentDetails: (serviceReportId) => readWaterTreatmentDetails(serviceReportId),
    createWaterTreatmentDetails: (details) => upsertWaterTreatmentDetails(details),
    updateWaterTreatmentDetails: (details) => upsertWaterTreatmentDetails(details),
    deleteWaterTreatmentDetails: (serviceReportId) => deleteWaterTreatmentDetails(serviceReportId),
    appendHistory: (event) => appendServiceReportHistory(event),
    saveCommand: (receipt) => saveServiceReportCommand(receipt),
  };
}