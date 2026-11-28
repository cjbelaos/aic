import axios from "axios";
import type { ProductUsage, ReplacementPlan, ReplacementResult } from "@/lib/productReplacement/types";

export type ReplacementPreview = Omit<ReplacementPlan, "cellEdits" | "salesOrderEdits">;

const productReplacementService = {
  usages: async (): Promise<ProductUsage[]> =>
    (await axios.get<{ usages: ProductUsage[] }>("/api/admin/inactive-product-usages")).data.usages,
  preview: async (fromProductId: string, toProductId: string): Promise<ReplacementPreview> =>
    (await axios.get<ReplacementPreview>(`/api/products/${encodeURIComponent(fromProductId)}/replacement-preview`, { params: { to: toProductId } })).data,
  replace: async (fromProductId: string, toProductId: string): Promise<ReplacementResult> =>
    (await axios.post<ReplacementResult>(`/api/products/${encodeURIComponent(fromProductId)}/replace`, { toProductId })).data,
};

export default productReplacementService;

/** Admin check for showing admin-only UI; the server enforces it on every call. */
export function isStoredUserAdmin(): boolean {
  try {
    const user = JSON.parse(window.localStorage.getItem("auth:user") ?? "{}") as { userRoleId?: number; isSuperAdmin?: boolean };
    return user.userRoleId === 1 || user.isSuperAdmin === true;
  } catch {
    return false;
  }
}
