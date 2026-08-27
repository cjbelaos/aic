import axios from "axios";
import type {
  FTIRequest,
  FTIDetails,
  FTIExpenses,
  FTIRequestSummary,
  FTIRequestFull,
  FTIDetailInput,
} from "@/types/fti";

const api = axios.create({
  baseURL: "/api",
  withCredentials: true,
  headers: { "Content-Type": "application/json" },
});

export const ftiService = {
  // ── FTIRequests ──
  async getRequests(): Promise<FTIRequestSummary[]> {
    const res = await api.get<FTIRequestSummary[]>("/fti/requests");
    return res.data;
  },

  async getRequestsByUser(userId: string): Promise<FTIRequestSummary[]> {
    const res = await api.get<FTIRequestSummary[]>(
      `/fti/requests?userId=${encodeURIComponent(userId)}`,
    );
    return res.data;
  },

  async getRequest(controlNo: string): Promise<FTIRequestFull> {
    const res = await api.get<FTIRequestFull>(
      `/fti/requests/${encodeURIComponent(controlNo)}`,
    );
    return res.data;
  },

  async createRequest(payload?: {
    userId?: string;
    controlNo?: string;
  }): Promise<FTIRequest> {
    const res = await api.post<FTIRequest>("/fti/requests", payload ?? {});
    return res.data;
  },

  async updateRequest(
    controlNo: string,
    payload: {
      status?: string;
      details?: FTIDetailInput[];
      ftiFileLink?: string;
    },
  ): Promise<FTIRequestFull> {
    // Note: Change to api.put if your route handler exports `export async function PUT`
    const res = await api.patch<FTIRequestFull>(
      `/fti/requests/${encodeURIComponent(controlNo)}`,
      payload,
    );
    return res.data;
  },

  /**
   * Perform an approval action on a SENT request.
   * Only the assigned approver (or admin) can perform these.
   * For "approve", ftiFileLink is the Google Drive link of the signed PDF.
   */
  async approveAction(
    controlNo: string,
    action: "approve" | "request_change" | "reject",
    comment?: string,
    ftiFileLink?: string,
    approvedByName?: string,
    approvedBySignatureUrl?: string,
  ): Promise<FTIRequestFull> {
    const res = await api.patch<FTIRequestFull>(
      `/fti/requests/${encodeURIComponent(controlNo)}`,
      { action, comment, ftiFileLink, approvedByName, approvedBySignatureUrl },
    );
    return res.data;
  },

  async deleteRequest(controlNo: string): Promise<void> {
    await api.delete(`/fti/requests/${encodeURIComponent(controlNo)}`);
  },

  // ── FTIDetails ──
  async getDetails(controlNo: string): Promise<FTIDetails[]> {
    const res = await api.get<FTIDetails[]>(
      `/fti/details/${encodeURIComponent(controlNo)}`,
    );
    return res.data;
  },

  async saveDetails(
    controlNo: string,
    details: Partial<FTIDetails>[],
  ): Promise<void> {
    await api.post(`/fti/details/${encodeURIComponent(controlNo)}`, {
      items: details,
    });
  },

  // ── Single-detail immediate persistence ──
  async appendDetail(
    controlNo: string,
    detail: FTIDetailInput,
    userId?: string,
  ): Promise<{ controlNo: string; detailId: string }> {
    const res = await api.post<{ controlNo: string; detailId: string }>(
      "/fti/details",
      { controlNo, detail, userId },
    );
    return res.data;
  },

  async updateDetail(
    controlNo: string,
    detailId: string,
    detail: FTIDetailInput,
    userId?: string,
  ): Promise<void> {
    await api.put("/fti/details", { controlNo, detailId, detail, userId });
  },

  async deleteDetailRow(detailId: string): Promise<void> {
    await api.delete(`/fti/details?detailId=${encodeURIComponent(detailId)}`);
  },

  // ── FTIExpenses ──
  async getExpenses(detailId: string): Promise<FTIExpenses[]> {
    const res = await api.get<FTIExpenses[]>(
      `/fti/expenses/${encodeURIComponent(detailId)}`,
    );
    return res.data;
  },

  async saveExpenses(
    detailId: string,
    expenses: Partial<FTIExpenses>[],
  ): Promise<void> {
    await api.post(`/fti/expenses/${encodeURIComponent(detailId)}`, {
      items: expenses,
    });
  },

  // ── Info / Lookup ──
  async getFormInfo(): Promise<{
    technicians: { userId: string; fullName: string }[];
    miscellaneous: { code: string; description: string }[];
    customers: { customerName: string; address: string }[];
    tollGates: string[];
    expresswayGroups: { name: string; gates: string[] }[];
    currentUserFullName: string;
    ftiRef: string;
    kmPerLiter: number;
  }> {
    const res = await api.get("/fti/info");
    return res.data;
  },

  // ── Liquidation linkage ──
  /**
   * Returns a lightweight map of controlNo → { liquidationId, status } | null
   * for all requested FTI control numbers in one request.
   * null means no liquidation is linked to that FTI.
   */
  async getLinkedLiquidationSummaries(
    controlNos: string[],
  ): Promise<Record<string, { liquidationId: string; status: string; userId: string } | null>> {
    if (controlNos.length === 0) return {};
    const res = await api.get<{
      summaries: Record<string, { liquidationId: string; status: string; userId: string } | null>;
    }>("/fti/liquidations", {
      params: { controlNos: controlNos.join(",") },
    });
    return res.data.summaries;
  },
};

export default ftiService;
