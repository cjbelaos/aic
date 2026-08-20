/* ── Agreement / Contract Header Types ─────────────────────── */
export type AgreementType = "Contract" | "PO";
export type ContractStatus = "Active" | "Expired" | "Closed" | "Inactive";
export type FrequencyType =
  | "Monthly"
  | "Quarterly"
  | "Semi-Annual"
  | "Annual"
  | "One-Time"
  | string;

export interface Contract {
  id: string; // Sheet: ContractId (e.g., "CTR-0001")
  companyId: string; // Sheet: CompanyId (Foreign key to Companies sheet)
  companyName?: string; // Optional: Hydrated in UI by joining with Companies sheet
  description?: string; // Sheet: Description (Optional contract description)
  agreementType: AgreementType; // Sheet: AgreementType ("Contract" | "PO")
  poNumber?: string; // Sheet: PONumber (Optional, relevant for PO base)
  startDate: string; // Sheet: StartDate (ISO Date string: "YYYY-MM-DD")
  endDate: string; // Sheet: EndDate (ISO Date string: "YYYY-MM-DD")
  status: ContractStatus; // Sheet: Status
}

export interface CreateContractPayload {
  companyId: string;
  description?: string;
  agreementType: AgreementType;
  poNumber?: string;
  startDate: string;
  endDate: string;
  status: ContractStatus;
}

export interface UpdateContractPayload extends Partial<CreateContractPayload> {
  id: string;
}

/* ── Line-Item Product Entitlement Types ───────────────────── */
export interface ContractItem {
  id: string; // Sheet: ItemId (e.g., "CTI-0001")
  contractId: string; // Foreign Key to Contract.id
  productCode: string; // Sheet: ProductCode
  entitledQty: number; // Sheet: EntitledQty
  frequency: FrequencyType; // Sheet: Frequency
  status: "Active" | "Inactive"; // Sheet: Status
}

export interface CreateContractItemPayload {
  contractId: string;
  productCode: string;
  entitledQty: number;
  frequency: FrequencyType;
  status: "Active" | "Inactive";
}

export interface UpdateContractItemPayload extends Partial<CreateContractItemPayload> {
  id: string;
}

/* ── Composite Type for UI / Form State ─────────────────────── */
export interface ContractWithItems extends Contract {
  items: ContractItem[];
}