import axios from "axios";
import type {
  Position,
  CreatePositionInput,
  UpdatePositionInput,
} from "@/types/position";

const api = axios.create({
  baseURL: "/api",
  withCredentials: true,
  headers: { "Content-Type": "application/json" },
});

export const positionService = {
  async getAll(): Promise<Position[]> {
    try {
      const response = await api.get<Position[]>("/positions");
      return response.data;
    } catch (error: any) {
      throw new Error(
        error.response?.data?.error || "Failed to load positions.",
      );
    }
  },

  async create(payload: CreatePositionInput): Promise<Position> {
    try {
      const response = await api.post<Position>("/positions", payload);
      return response.data;
    } catch (error: any) {
      throw new Error(
        error.response?.data?.error || "Failed to create position.",
      );
    }
  },

  async update(id: string, payload: UpdatePositionInput): Promise<Position> {
    try {
      const response = await api.put<Position>(`/positions/${id}`, payload);
      return response.data;
    } catch (error: any) {
      throw new Error(
        error.response?.data?.error || "Failed to update position.",
      );
    }
  },

  async delete(id: string): Promise<void> {
    try {
      await api.delete(`/positions/${id}`);
    } catch (error: any) {
      throw new Error(
        error.response?.data?.error || "Failed to delete position.",
      );
    }
  },
};

export default positionService;
