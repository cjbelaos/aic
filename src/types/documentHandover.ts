export type DocumentType = "delivery_receipt" | "service_invoice";
export type HandoverStatus =
  | "handed_over"
  | "received_by_after_sales"
  | "returned"
  | "unassigned";

export interface DocumentOption {
  /** Unique key e.g. "dr_3690" or "si_1587" */
  value: string;
  documentType: DocumentType;
  documentNumber: string;
  customerName: string;
  date?: string;
  label: string;
}

export interface DocumentHandover {
  id: string;
  documentType: DocumentType;
  documentNumber: string;
  customerName?: string;
  /** The person who received the documents */
  assignedToId?: string;
  /** The person who received the documents (denormalized name) */
  assignedToName: string;
  assigneeType?: "internal" | "external";
  assignedBy: string;
  assignedByName: string;
  assignedAt: string;
  status: HandoverStatus;
  returnedBy?: string;
  returnedByName?: string;
  returnedAt?: string;
  /** Custody confirmation by the designated After Sales receiver. */
  receivedByAfterSales?: string;
  receivedByAfterSalesName?: string;
  receivedByAfterSalesAt?: string;
  /** Final physical-document verification by an admin. */
  verifiedBy?: string;
  verifiedByName?: string;
  verifiedAt?: string;
  /** Recorded when the designated receiver confirms it was not received. */
  unassignedBy?: string;
  unassignedByName?: string;
  unassignedAt?: string;
  notes?: string;
}

export interface Assignee {
  userId: string;
  fullName: string;
  departmentName?: string;
}

export interface CreateDocumentHandoverInput {
  documentType: DocumentType;
  documentNumber: string;
  customerName?: string;
  assignedToId?: string;
  assignedToName: string;
  assigneeType?: "internal" | "external";
  notes?: string;
}

export interface ReturnDocumentHandoverInput {
  ids: string[];
  returnedBy: string;
  returnedByName: string;
  notes?: string;
}

export interface WorkflowDocumentHandoverInput {
  ids: string[];
  actorId: string;
  actorName: string;
  notes?: string;
}

export interface DocumentHandoverStats {
  total: number;
  handedOver: number;
  returned: number;
}
