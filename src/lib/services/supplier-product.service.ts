import axios from "axios";
import type { CreateSupplierProductPayload, SupplierProduct, UpdateSupplierProductPayload } from "@/types/supplier-product";

const BASE = "/api/supplier-products";
const supplierProductService = {
  getAll: async (filters?: { productId?: string; supplierId?: string; status?: string }): Promise<SupplierProduct[]> => {
    const response = await axios.get<SupplierProduct[]>(BASE, { params: filters });
    return Array.isArray(response.data) ? response.data : [];
  },
  create: async (payload: CreateSupplierProductPayload): Promise<SupplierProduct> => (await axios.post<SupplierProduct>(BASE, payload)).data,
  update: async (payload: UpdateSupplierProductPayload): Promise<SupplierProduct> => (await axios.put<SupplierProduct>(`${BASE}/${payload.supplierProductId}`, payload)).data,
  deactivate: async (id: string): Promise<void> => { await axios.delete(`${BASE}/${id}`); },
};
export default supplierProductService;