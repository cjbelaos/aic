import axios from "axios";
import type { UserApprover } from "@/types/userApprover";

const api = axios.create({
  baseURL: "/api",
  withCredentials: true,
  headers: { "Content-Type": "application/json" },
});

export const userApproverService = {
  async getAll(approvalType?: string): Promise<UserApprover[]> {
    try {
      const params = approvalType
        ? { approvalType }
        : {};
      const response = await api.get<UserApprover[]>("/user-approvers", {
        params,
      });
      return response.data;
    } catch (error: any) {
      throw new Error(
        error.response?.data?.error || "Failed to load user-approver mappings.",
      );
    }
  },

  async create(payload: Omit<UserApprover, "configId">): Promise<UserApprover> {
    try {
      const response = await api.post<UserApprover>("/user-approvers", payload);
      return response.data;
    } catch (error: any) {
      throw new Error(
        error.response?.data?.error ||
          "Failed to create user-approver mapping.",
      );
    }
  },

  async remove(configId: string): Promise<void> {
    try {
      await api.delete(
        `/user-approvers?configId=${encodeURIComponent(configId)}`,
      );
    } catch (error: any) {
      throw new Error(
        error.response?.data?.error ||
          "Failed to delete user-approver mapping.",
      );
    }
  },
};

export default userApproverService;
