import axios from "axios";
import {
  ScheduledCollection,
  CollectionHistory,
  CreateScheduledCollectionPayload,
  LogCollectionPayload,
} from "@/types/collection";

const API_BASE_URL = "/api/collections";

const collectionService = {
  /**
   * Fetch all currently pending scheduled collections
   */
  getScheduled: async (): Promise<ScheduledCollection[]> => {
    try {
      const response = await axios.get<ScheduledCollection[]>(
        `${API_BASE_URL}/scheduled`,
      );
      return Array.isArray(response.data) ? response.data : [];
    } catch (error) {
      console.error(
        "Failed to fetch scheduled collections in service layer:",
        error,
      );
      return [];
    }
  },

  /**
   * Fetch historical logged collections
   */
  getHistory: async (): Promise<CollectionHistory[]> => {
    try {
      const response = await axios.get<CollectionHistory[]>(
        `${API_BASE_URL}/history`,
      );
      return Array.isArray(response.data) ? response.data : [];
    } catch (error) {
      console.error(
        "Failed to fetch collection history in service layer:",
        error,
      );
      return [];
    }
  },

  /**
   * Add a company to the advance collection schedule
   */
  createSchedule: async (
    payload: CreateScheduledCollectionPayload,
  ): Promise<ScheduledCollection | null> => {
    try {
      const response = await axios.post<ScheduledCollection>(
        `${API_BASE_URL}/scheduled`,
        payload,
      );
      return response.data;
    } catch (error) {
      console.error(
        "Failed to create scheduled collection in service layer:",
        error,
      );
      throw error;
    }
  },

  /**
   * Log a completed payment (appends to history & clears schedule)
   */
  logCollection: async (
    payload: LogCollectionPayload,
  ): Promise<CollectionHistory | null> => {
    try {
      const response = await axios.post<CollectionHistory>(
        `${API_BASE_URL}/history`,
        payload,
      );
      return response.data;
    } catch (error) {
      console.error("Failed to log collection in service layer:", error);
      throw error;
    }
  },

  /**
   * Delete or cancel a scheduled collection before completion
   */
  deleteSchedule: async (id: string): Promise<void> => {
    try {
      await axios.delete(`${API_BASE_URL}/scheduled/${id}`);
    } catch (error) {
      console.error(
        `Failed to delete scheduled collection with ID ${id} in service layer:`,
        error,
      );
      throw error;
    }
  },

  updateStatus: async (
    id: string,
    status: "PENDING" | "CANCELLED",
  ): Promise<void> => {
    try {
      await axios.patch(`${API_BASE_URL}/scheduled`, { id, status });
    } catch (error) {
      console.error(`Failed to update status for ${id}:`, error);
      throw error;
    }
  },
};

export default collectionService;
