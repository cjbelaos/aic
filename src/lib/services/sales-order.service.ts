import api from "@/lib/apiClient";
import type {
  SalesOrder,
  SalesOrderItem,
  SalesOrderHistory,
  SalesOrderDocument,
  SalesOrderFulfillment,
  SalesOrderDocumentLink,
  SalesOrderSyncJob,
} from "@/types/salesOrder";

export interface SalesOrderDetail {
  order: SalesOrder;
  items: SalesOrderItem[];
  history: SalesOrderHistory[];
  documents: SalesOrderDocument[];
  fulfillments: SalesOrderFulfillment[];
  documentLinks: SalesOrderDocumentLink[];
  syncJobs: SalesOrderSyncJob[];
  totals: { subtotalExTax: number; discountTotal: number; taxTotal: number; grandTotal: number };
  category: string;
}

export interface OrderRowView {
  order: SalesOrder;
  itemsCount: number;
  activeLines: number;
  category: string;
  fulfillmentPercent: number;
  overdue: boolean;
  ageDays: number;
  syncStatus: string;
}

export interface OrderListResponse {
  rows: OrderRowView[];
  total: number;
  page: number;
  pageSize: number;
}

export interface OrderLineInput {
  salesOrderItemId?: string;
  lineType: "PRODUCT" | "SERVICE";
  productId?: string;
  productCodeSnapshot?: string;
  productNameSnapshot?: string;
  description: string;
  unitId: string;
  unitSnapshot?: string;
  customerProductName?: string;
  quantity: number | null;
  unitPrice: number | null;
  priceSource?: string;
  priceOverrideReason?: string;
  customerProductPriceId?: string;
  quotationLineReference?: string;
  discountAmount?: number;
  taxMode?: string;
  taxRate?: number;
  orderCategory?: string;
}

export interface OrderInput {
  commandId?: string;
  sourceQuotationNo?: string;
  customerId: string;
  customerNameSnapshot?: string;
  customerTINSnapshot?: string;
  billingAddressSnapshot?: string;
  contactId?: string;
  contactNameSnapshot?: string;
  contactPhoneSnapshot?: string;
  deliveryAddressSnapshot?: string;
  customerPONo?: string;
  paymentTermId?: string;
  paymentTermsSnapshot?: string;
  receivedDate: string;
  requiredDate?: string;
  assignedToUserId?: string;
  currency?: string;
  remarks?: string;
  lines: OrderLineInput[];
}

export interface OptionsResponse {
  customers: Array<{ customerId: string; companyName: string; tin: string; address: string }>;
  users: Array<{ userId: string; fullName: string; username: string }>;
  terms: Array<{ paymentTermId: string; name: string }>;
  categories: Array<{ productCategoryId: string; categoryName: string }>;
  units: Array<{ unitId: string; unitCode: string; unitName: string }>;
  quotations: Array<{ quotationNo: string; customer: string; customerId?: string; date: string; status: string; amount: number }>;
  products: Array<{ productId: string; productCode: string; productName: string; productCategoryId: string; unitId: string; defaultSellingPrice: number | null }>;
  orderCategories: string[];
  assignmentMandatory: boolean;
}

export interface PricingResponse {
  pricePerUnit: number;
  source: string;
  customerProductPriceId?: string;
  customerProductName?: string;
}

const BASE = "/sales-orders";

function newId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") return crypto.randomUUID();
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}
const salesOrderService = {
  list: (params: Record<string, string | number | boolean | undefined> = {}): Promise<OrderListResponse> => {
    const query: Record<string, string> = {};
    for (const [key, value] of Object.entries(params)) {
      if (value !== undefined && value !== "" && value !== false) query[key] = String(value);
    }
    return api.get<OrderListResponse>(BASE, { params: query });
  },

  get: (id: string): Promise<SalesOrderDetail & { success: boolean; capabilities?: { canEdit: boolean } }> =>
    api.get(`${BASE}/${id}`),

  createDraft: (payload: OrderInput): Promise<{ success: boolean; order: SalesOrderDetail }> =>
    mutate("post", `${BASE}`, { ...payload, commandId: payload.commandId }),

  updateDraft: (id: string, payload: OrderInput & { expectedVersion: number }): Promise<{ success: boolean; order: SalesOrderDetail }> =>
    mutate("patch", `${BASE}/${id}`, { ...payload, commandId: payload.commandId }),

  confirm: (id: string, expectedVersion: number): Promise<{ success: boolean; order: SalesOrderDetail }> =>
    mutate("post", `${BASE}/${id}/confirm`, { expectedVersion }),

  hold: (id: string, expectedVersion: number): Promise<{ success: boolean; order: SalesOrderDetail }> =>
    mutate("post", `${BASE}/${id}/hold`, { expectedVersion }),

  resume: (id: string, expectedVersion: number): Promise<{ success: boolean; order: SalesOrderDetail }> =>
    mutate("post", `${BASE}/${id}/resume`, { expectedVersion }),

  cancel: (id: string, expectedVersion: number, reason: string): Promise<{ success: boolean; order: SalesOrderDetail }> =>
    mutate("post", `${BASE}/${id}/cancel`, { expectedVersion, reason }),

  close: (id: string, expectedVersion: number, reason: string): Promise<{ success: boolean; order: SalesOrderDetail }> =>
    mutate("post", `${BASE}/${id}/close`, { expectedVersion, reason }),

  postFulfillments: (id: string, expectedVersion: number, entries: Array<{
    salesOrderItemId: string; type: "DELIVERY" | "SERVICE_COMPLETION" | "REVERSAL"; quantity: number;
    effectiveDate: string; sourceDocumentType?: string; sourceDocumentId?: string; sourceLineId?: string;
    evidenceDriveFileId?: string; reversesFulfillmentId?: string;
  }>): Promise<{ success: boolean; order: SalesOrderDetail }> =>
    mutate("post", `${BASE}/${id}/fulfillments`, { expectedVersion, entries }),

  attachDocument: (id: string, document: {
    documentType: string; externalDocumentNo?: string; driveFileId?: string; externalUrl?: string;
    fileName?: string; mimeType?: string; orderVersion?: number;
  }): Promise<{ success: boolean; document: SalesOrderDocument }> =>
    mutate("post", `${BASE}/${id}/documents`, { ...document }),

  uploadDocument: (id: string, input: {
    documentType: string; file: File; orderVersion: number; externalDocumentNo?: string;
  }): Promise<{ success: boolean; document: SalesOrderDocument }> => {
    const form = new FormData();
    form.set("commandId", newId());
    form.set("documentType", input.documentType);
    form.set("orderVersion", String(input.orderVersion));
    form.set("externalDocumentNo", input.externalDocumentNo ?? "");
    form.set("file", input.file);
    return api.post(`${BASE}/${id}/documents`, form, { headers: { "Content-Type": "multipart/form-data" } });
  },

  linkDelivery: (id: string, expectedVersion: number, link: {
    documentType: string; documentId: string; documentLineId?: string;
    entries: Array<{ salesOrderItemId: string; linkedQty: number }>;
  }): Promise<{ success: boolean; links: SalesOrderDocumentLink[] }> =>
    mutate("post", `${BASE}/${id}/documents/link`, { expectedVersion, ...link }),

  generatePdf: (id: string): Promise<{
    success: boolean;
    artifact?: { orderVersion: number; fileName: string; mimeType: string; pdf: string };
    document?: SalesOrderDocument;
    storage?: string;
  }> => mutate("post", `${BASE}/${id}/pdf`, {}),

  fromQuotation: (quotationNo: string): Promise<{ success: boolean; order: SalesOrderDetail & { reusedExisting?: boolean } }> =>
    mutate("post", `${BASE}/from-quotation`, { quotationNo }),

  history: (id: string): Promise<{ success: boolean; history: SalesOrderHistory[] }> =>
    api.get(`${BASE}/${id}/history`),

  retrySync: (id: string): Promise<{ success: boolean; queued: boolean }> =>
    mutate("post", `${BASE}/${id}/sync/retry`, {}),

  options: (): Promise<OptionsResponse> => api.get(`${BASE}/options`),

  pricing: (customerId: string, productId: string, date: string): Promise<PricingResponse> =>
    api.get(`${BASE}/pricing`, { params: { customerId, productId, date } }),
};

export default salesOrderService;
// Keep the same intent ID across ambiguous failures and manual retries, including
// a reload in this tab. Successful actions release their key so a later identical
// action is a new command. The server binds the receipt to actor and input.
const pendingCommands = new Map<string, string>();
function ordered(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(ordered);
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => [k, ordered(v)]));
  return value;
}
async function mutate<T>(method: "post" | "patch", url: string, body: object): Promise<T> {
  const payload = body as Record<string, unknown>;
  // Do not persist customer contents in sessionStorage; only a digest and UUID.
  const bytes = new TextEncoder().encode(JSON.stringify(ordered({ method, url, ...payload, commandId: undefined })));
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  const key = "so-command:" + Array.from(new Uint8Array(digest), b => b.toString(16).padStart(2, "0")).join("");
  let stored: string | null = null;
  try { stored = sessionStorage.getItem(key); } catch { /* memory fallback */ }
  const commandId = String(payload.commandId || stored || pendingCommands.get(key) || newId());
  pendingCommands.set(key, commandId);
  try { sessionStorage.setItem(key, commandId); } catch { /* memory fallback */ }
  const result = await api[method]<T>(url, { ...payload, commandId });
  pendingCommands.delete(key);
  try { sessionStorage.removeItem(key); } catch { /* memory fallback */ }
  return result;
}
