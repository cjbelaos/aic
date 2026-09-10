import axios from "axios";
import type { CreateSupplierProductV2Payload, SupplierProductV2, UpdateSupplierProductV2Payload } from "@/types/supplier-product";

const BASE = "/api/v2/supplier-products";
const supplierProductV2Service = {
  getAll: async (filters?: { productId?: string; supplierId?: string; status?: string }): Promise<SupplierProductV2[]> => {
    const response = await axios.get<SupplierProductV2[]>(BASE, { params: filters });
    return Array.isArray(response.data) ? response.data : [];
  },
  create: async (payload: CreateSupplierProductV2Payload): Promise<SupplierProductV2> => (await axios.post<SupplierProductV2>(BASE, payload)).data,
  update: async (payload: UpdateSupplierProductV2Payload): Promise<SupplierProductV2> => (await axios.put<SupplierProductV2>(`${BASE}/${payload.supplierProductId}`, payload)).data,
  deactivate: async (id: string): Promise<void> => { await axios.delete(`${BASE}/${id}`); },
};
export default supplierProductV2Service;
