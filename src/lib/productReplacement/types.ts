// Plain snapshot + result types for inactive-product replacement.
// Self-contained (no "@/" aliases) so native-TypeScript tests can import it.

export interface SnapshotProduct { productId: string; productCode: string; productName: string; status: "active" | "inactive" }
export interface SnapshotContract { id: string; status: string; endDate: string; agreementType?: string; companyName: string }
export interface SnapshotContractItem { id: string; contractId: string; productId: string; productCode: string; status: string; rowNumber: number }
export interface SnapshotSalesOrder { salesOrderId: string; salesOrderNo: string; orderStatus: string; version: number; customerName: string }
export interface SnapshotSalesOrderItem {
  salesOrderItemId: string; salesOrderId: string; lineNo: number; productId: string; lineStatus: string;
  quantity: number | null; fulfilledQty: number; cancelledQty: number;
}
export interface SnapshotPurchaseRequest { prId: string; prNo: string; status: string; version: number; rowNumber: number; customerName: string }
export interface SnapshotPrItem {
  prItemId: string; prId: string; lineNo: number; productId: string; productCode: string; productName: string; quantity: number;
  fromStockQty: number; cancelledQty: number; rowNumber: number;
}
export interface SnapshotPrLink { prItemId: string; quantity: number }
export interface SnapshotQuotation { quotationNo: string; status: string; customerName: string }
export interface SnapshotQuotationDetail { quotationNo: string; productId: string; productCode: string; rowNumber: number }
export interface SnapshotPurchaseOrder { poNumber: string; status: string; supplierId: string; supplierName: string }
export interface SnapshotPoItem { poNumber: string; itemNo: number; productId: string; supplierProductId: string; rowNumber: number }
export interface SnapshotCustomerPrice {
  id: string; customerId: string; customerName: string; productId: string; pricePerUnit: number; status: string; rowNumber: number;
}
export interface SnapshotSupplierProduct {
  id: string; supplierId: string; supplierName: string; productId: string; status: string; rowNumber: number;
}

export interface ReplacementSnapshot {
  products: SnapshotProduct[];
  contracts: SnapshotContract[];
  contractItems: SnapshotContractItem[];
  salesOrders: SnapshotSalesOrder[];
  salesOrderItems: SnapshotSalesOrderItem[];
  purchaseRequests: SnapshotPurchaseRequest[];
  prItems: SnapshotPrItem[];
  prLinks: SnapshotPrLink[];
  quotations: SnapshotQuotation[];
  quotationDetails: SnapshotQuotationDetail[];
  purchaseOrders: SnapshotPurchaseOrder[];
  poItems: SnapshotPoItem[];
  customerPrices: SnapshotCustomerPrice[];
  supplierProducts: SnapshotSupplierProduct[];
}

export type UsageDocumentType =
  | "contract" | "salesOrder" | "purchaseRequest" | "quotation" | "purchaseOrder" | "customerPrice" | "supplierProduct";

export interface ProductUsage {
  productId: string;
  productCode: string;
  productName: string;
  documentType: UsageDocumentType;
  documentId: string;
  documentNo: string;
  /** Customer or supplier the document is for, so it can be recognised without opening it. */
  partyName: string;
  lineLabel: string;
  disposition: "replaceable" | "needs_manual";
  /** Why it is listed or skipped; blank when it can simply be replaced. */
  reason: string;
  href: string;
}

export interface CellEdit { sheet: string; rowNumber: number; column: string; oldValue: string; newValue: string }

export interface SalesOrderEdit { salesOrderId: string; expectedVersion: number; itemIds: string[] }

export interface ReplacementPlan {
  from: SnapshotProduct;
  to: SnapshotProduct;
  changes: ProductUsage[];
  skipped: ProductUsage[];
  conflicts: ProductUsage[];
  cellEdits: CellEdit[];
  salesOrderEdits: SalesOrderEdit[];
}

export interface ReplacementResult {
  replacementId: string;
  status: "completed" | "partial";
  applied: number;
  skipped: ProductUsage[];
  conflicts: ProductUsage[];
  error?: string;
}

export class ReplacementInputError extends Error {}
