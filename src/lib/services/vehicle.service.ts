import axios from "axios";
import {
  Vehicle,
  CreateVehiclePayload,
  UpdateVehiclePayload,
} from "@/types/vehicle";

const API_BASE_URL = "/api/vehicles";

const vehicleService = {
  getAll: async (): Promise<Vehicle[]> => {
    try {
      const response = await axios.get<Vehicle[]>(API_BASE_URL);
      return Array.isArray(response.data) ? response.data : [];
    } catch (error) {
      console.error("Failed to fetch vehicles in service layer:", error);
      return [];
    }
  },

  create: async (payload: CreateVehiclePayload): Promise<Vehicle> => {
    try {
      const response = await axios.post<Vehicle>(API_BASE_URL, payload);
      return response.data;
    } catch (error) {
      console.error("Failed to create vehicle in service layer:", error);
      throw error;
    }
  },

  update: async (
    vehicleId: string,
    payload: UpdateVehiclePayload,
  ): Promise<Vehicle> => {
    try {
      const response = await axios.put<Vehicle>(
        `${API_BASE_URL}/${vehicleId}`,
        payload,
      );
      return response.data;
    } catch (error) {
      console.error(`Failed to update vehicle ${vehicleId}:`, error);
      throw error;
    }
  },

  delete: async (vehicleId: string): Promise<void> => {
    try {
      await axios.delete(`${API_BASE_URL}/${vehicleId}`);
    } catch (error) {
      console.error(`Failed to delete vehicle ${vehicleId}:`, error);
      throw error;
    }
  },
};

export default vehicleService;