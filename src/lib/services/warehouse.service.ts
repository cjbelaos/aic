import axios from "axios";
import type { CreateWarehousePayload, Warehouse } from "@/types/warehouse";
const API = "/api/warehouses";
const warehouseService = { getAll: async () => (await axios.get<Warehouse[]>(API)).data, create: async (payload: CreateWarehousePayload) => (await axios.post<Warehouse>(API, payload)).data, update: async (id: string, payload: CreateWarehousePayload) => (await axios.put<Warehouse>(`${API}/${id}`, payload)).data, delete: async (id: string) => { await axios.delete(`${API}/${id}`); } };
export default warehouseService;
