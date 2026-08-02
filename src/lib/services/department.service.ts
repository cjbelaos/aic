import axios from "axios";
import type {
  Department,
  CreateDepartmentInput,
  UpdateDepartmentInput,
} from "@/types/department";

const api = axios.create({
  baseURL: "/api",
  withCredentials: true,
  headers: { "Content-Type": "application/json" },
});

export const departmentService = {
  async getAll(): Promise<Department[]> {
    try {
      const response = await api.get<Department[]>("/departments");
      return response.data;
    } catch (error: any) {
      throw new Error(
        error.response?.data?.error || "Failed to load departments.",
      );
    }
  },

  async create(payload: CreateDepartmentInput): Promise<Department> {
    try {
      const response = await api.post<Department>("/departments", payload);
      return response.data;
    } catch (error: any) {
      throw new Error(
        error.response?.data?.error || "Failed to create department.",
      );
    }
  },

  async update(
    id: string,
    payload: UpdateDepartmentInput,
  ): Promise<Department> {
    try {
      const response = await api.put<Department>(`/departments/${id}`, payload);
      return response.data;
    } catch (error: any) {
      throw new Error(
        error.response?.data?.error || "Failed to update department.",
      );
    }
  },

  async delete(id: string): Promise<void> {
    try {
      await api.delete(`/departments/${id}`);
    } catch (error: any) {
      throw new Error(
        error.response?.data?.error || "Failed to delete department.",
      );
    }
  },
};

export default departmentService;
