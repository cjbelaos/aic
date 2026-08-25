import axios from "axios";
import { ContractRelease, ContractPeriodSummary } from "@/types/contract-release";

const API_BASE_URL = "/api/contract-releases";

const contractReleaseService = {
  /**
   * Process a new release
   */
  processRelease: async (
    contractItemId: string,
    quantity: number,
    releaseDate: string,
    releasedBy: string,
    remarks?: string,
    contractId?: string,
    productCode?: string,
    drNumber?: number,
  ): Promise<ContractRelease | null> => {
    try {
      const response = await axios.post<ContractRelease>(`${API_BASE_URL}/process`, {
        contractItemId,
        contractId,
        productCode,
        quantity,
        releaseDate,
        releasedBy,
        remarks,
        drNumber,
      });
      return response.data;
    } catch (error) {
      console.error("Failed to process release:", error);
      throw error;
    }
  },

  /**
   * Get releases for a specific period
   */
  getReleasesForPeriod: async (
    contractItemId: string,
    periodYear: number,
    periodMonth: number,
  ): Promise<ContractRelease[]> => {
    try {
      const response = await axios.get<ContractRelease[]>(
        `${API_BASE_URL}?contractItemId=${contractItemId}&periodYear=${periodYear}&periodMonth=${periodMonth}`,
      );
      return Array.isArray(response.data) ? response.data : [];
    } catch (error) {
      console.error("Failed to fetch releases:", error);
      return [];
    }
  },

  /**
   * Get period summaries for a contract item
   */
  getPeriodSummaries: async (
    contractItemId?: string,
    periodYear?: number,
    periodMonth?: number,
    contractId?: string,
  ): Promise<ContractPeriodSummary[]> => {
    try {
      const params = new URLSearchParams();
      if (contractItemId) params.append("contractItemId", contractItemId);
      if (periodYear) params.append("periodYear", periodYear.toString());
      if (periodMonth) params.append("periodMonth", periodMonth.toString());
      if (contractId) params.append("contractId", contractId);

      const response = await axios.get<ContractPeriodSummary[]>(
        `/api/contract-period-summaries?${params.toString()}`,
      );
      return Array.isArray(response.data) ? response.data : [];
    } catch (error) {
      console.error("Failed to fetch period summaries:", error);
      return [];
    }
  },

  /**
   * Get compliance report for a contract
   */
  getComplianceReport: async (
    contractId: string,
    year?: number,
    month?: number,
  ): Promise<any[]> => {
    try {
      const params = new URLSearchParams({ contractId });
      if (year) params.append("year", year.toString());
      if (month) params.append("month", month.toString());

      const response = await axios.get(
        `/api/contract-releases/compliance?${params.toString()}`,
      );
      return Array.isArray(response.data) ? response.data : [];
    } catch (error) {
      console.error("Failed to fetch compliance report:", error);
      return [];
    }
  },

  /**
   * Get overdue releases
   */
  getOverdueReleases: async (): Promise<ContractPeriodSummary[]> => {
    try {
      const response = await axios.get<ContractPeriodSummary[]>(
        "/api/contract-releases/overdue",
      );
      return Array.isArray(response.data) ? response.data : [];
    } catch (error) {
      console.error("Failed to fetch overdue releases:", error);
      return [];
    }
  },

  /**
   * Get current period status for a contract
   */
  getCurrentPeriodStatus: async (
    contractId: string,
  ): Promise<ContractPeriodSummary[]> => {
    try {
      const response = await axios.get<ContractPeriodSummary[]>(
        `/api/contract-period-summaries/current?contractId=${contractId}`,
      );
      return Array.isArray(response.data) ? response.data : [];
    } catch (error) {
      console.error("Failed to fetch current period status:", error);
      return [];
    }
  },
};

export default contractReleaseService;