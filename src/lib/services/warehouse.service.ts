import axios from "axios";
import type { Warehouse, WarehouseInput } from "@/types/warehouse";

const API = "/api/warehouses";

/** Surfaces the server's message (e.g. a duplicate code) instead of a generic Axios error. */
async function call<T>(request: Promise<{ data: T }>): Promise<T> {
  try {
    return (await request).data;
  } catch (error) {
    const message = axios.isAxiosError(error) ? (error.response?.data as { error?: string } | undefined)?.error : undefined;
    throw new Error(message || (error instanceof Error ? error.message : "Warehouse request failed."));
  }
}

const warehouseService = {
  getAll: () => call(axios.get<Warehouse[]>(API)),
  create: (input: WarehouseInput) => call(axios.post<Warehouse>(API, input)),
  update: (id: string, input: WarehouseInput) => call(axios.put<Warehouse>(`${API}/${id}`, input)),
  setActive: (id: string, active: boolean) => call(axios.patch<Warehouse>(`${API}/${id}`, { active })),
};

export default warehouseService;
