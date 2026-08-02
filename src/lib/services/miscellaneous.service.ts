import axios from "axios";
import type {
  Miscellaneous,
  CreateMiscellaneousInput,
  UpdateMiscellaneousInput,
} from "@/types/miscellaneous";

const api = axios.create({
  baseURL: "/api",
  withCredentials: true,
  headers: { "Content-Type": "application/json" },
});

export const miscellaneousService = {
  async getAll(): Promise<Miscellaneous[]> {
    const res = await api.get<Miscellaneous[]>("/miscellaneous");
    return res.data;
  },

  async create(payload: CreateMiscellaneousInput): Promise<Miscellaneous> {
    const res = await api.post<Miscellaneous>("/miscellaneous", payload);
    return res.data;
  },

  async update(payload: UpdateMiscellaneousInput): Promise<Miscellaneous> {
    const res = await api.put<Miscellaneous>("/miscellaneous", payload);
    return res.data;
  },

  async delete(code: string): Promise<void> {
    await api.delete(`/miscellaneous/${encodeURIComponent(code)}`);
  },
};

export default miscellaneousService;
