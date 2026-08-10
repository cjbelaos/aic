export type NewFlowStatus =
  | "SCHEDULED"
  | "FTI_SENT"
  | "FTI_PENDING"
  | "FTI_APPROVED";

export interface NewFlowSchedule {
  id: string;
  date: string;
  technicianId: string;
  technicianName: string;
  customerName: string;
  description: string;
  status: NewFlowStatus;
  controlNo?: string;
  deliveryReportLink?: string;
  serviceInvoiceLink?: string;
  dateCreated: string;
  updatedAt?: string;
}