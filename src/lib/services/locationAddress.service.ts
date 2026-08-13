import axios from "axios";
import {
  LocationAddress,
  CreateLocationAddressPayload,
} from "@/types/locationAddress";

const API_BASE_URL = "/api/location-addresses";

const locationAddressService = {
  getAll: async (): Promise<LocationAddress[]> => {
    try {
      const response = await axios.get<LocationAddress[]>(API_BASE_URL);
      return Array.isArray(response.data) ? response.data : [];
    } catch (error) {
      console.error(
        "Failed to fetch location addresses in service layer:",
        error,
      );
      return [];
    }
  },

  create: async (
    payload: CreateLocationAddressPayload,
  ): Promise<LocationAddress | null> => {
    try {
      const response = await axios.post<LocationAddress>(API_BASE_URL, payload);
      return response.data;
    } catch (error) {
      console.error("Failed to create location address in service layer:", error);
      throw error;
    }
  },

  update: async (
    payload: CreateLocationAddressPayload & { id: string },
  ): Promise<LocationAddress | null> => {
    try {
      const response = await axios.put<LocationAddress>(
        `${API_BASE_URL}/${payload.id}`,
        payload,
      );
      return response.data;
    } catch (error) {
      console.error(
        `Failed to update location address with ID ${payload.id} in service layer:`,
        error,
      );
      throw error;
    }
  },

  delete: async (id: string): Promise<void> => {
    try {
      await axios.delete(`${API_BASE_URL}/${id}`);
    } catch (error) {
      console.error(
        `Failed to delete location address with ID ${id} in service layer:`,
        error,
      );
      throw error;
    }
  },
};

export default locationAddressService;