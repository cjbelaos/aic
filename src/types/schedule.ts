/**
 * Schedule Calendar entry linking an FTI detail row (technician + date +
 * customer) to optional Delivery Report / Service Invoice attachments.
 */

export interface ScheduleEntry {
  id: string;
  controlNo: string; // linked FTI control number (FTIRequests)
  detailId: string; // linked FTIDetails row
  date: string; // yyyy-MM-dd (FTI detail date)
  technician: string; // technician full name
  customerName: string; // "itinerary" field on the FTI detail
  description: string;
  ftiStatus: string;
  deliveryReportLink?: string; // Google Drive share link
  serviceInvoiceLink?: string; // Google Drive share link
  dateCreated: string;
  updatedAt?: string;
}

export interface CreateSchedulePayload {
  controlNo: string;
  detailId?: string;
  date: string;
  technician: string;
  customerName: string;
  description?: string;
  ftiStatus?: string;
  deliveryReportLink?: string;
  serviceInvoiceLink?: string;
}

export interface UpdateSchedulePayload {
  controlNo?: string;
  detailId?: string;
  date?: string;
  technician?: string;
  customerName?: string;
  description?: string;
  ftiStatus?: string;
  deliveryReportLink?: string;
  serviceInvoiceLink?: string;
}

/** Options for a linked FTI detail row shown in the event modal. */
export interface FTILinkOption {
  controlNo: string;
  detailId: string;
  date: string;
  technician: string;
  customerName: string;
  description: string;
  status: string;
}
