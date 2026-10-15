import { createInvoiceRepository } from "./invoiceRepository";
export type { UpdateServiceInvoicePayload, ManualServiceCompletionInput } from "./invoiceRepository";
export const {
  readServiceInvoiceItemValues,
  resolvePreparedByPosition,
  updateServiceInvoicePayment,
  recordServiceInvoiceScan,
  getServiceInvoices,
  processServiceInvoice,
  updateServiceInvoiceCategory,
  cancelAndCreateCorrectedServiceInvoice,
  updateServiceInvoice,
  ensureServiceInvoiceDocumentTrackerAssignment,
  deleteServiceInvoice,
  syncSalesOrderServiceInvoiceReferences,
  syncSalesOrderInvoiceDiscounts
} = createInvoiceRepository("sales");
