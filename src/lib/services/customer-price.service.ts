import axios from "axios";
import {
  CustomerPrice,
  CreateCustomerPricePayload,
  UpdateCustomerPricePayload,
} from "@/types/customer-price";

const API_BASE_URL = "/api/customer-prices";

const customerPriceService = {
  /**
   * Fetches all customer price rows from the Google Sheet.
   */
  getAll: async (): Promise<CustomerPrice[]> => {
    try {
      const response = await axios.get<CustomerPrice[]>(API_BASE_URL);

      // Ensure the incoming data is safely an array
      return Array.isArray(response.data) ? response.data : [];
    } catch (error) {
      console.error("Failed to fetch customer prices in service layer:", error);
      // Return a safe fallback array so component .map() functions don't white-screen crash
      return [];
    }
  },

  /**
   * Appends a new customer price row to the Google Sheet.
   */
  create: async (
    payload: CreateCustomerPricePayload,
  ): Promise<CustomerPrice | null> => {
    try {
      const response = await axios.post<CustomerPrice>(API_BASE_URL, payload);
      return response.data;
    } catch (error) {
      console.error("Failed to create customer price in service layer:", error);
      throw error;
    }
  },

  /**
   * Updates an existing customer price row in the Google Sheet using its ID.
   */
  update: async (
    payload: UpdateCustomerPricePayload,
  ): Promise<CustomerPrice | null> => {
    try {
      const response = await axios.put<CustomerPrice>(
        `${API_BASE_URL}/${payload.id}`,
        payload,
      );
      return response.data;
    } catch (error) {
      console.error(
        `Failed to update customer price with ID ${payload.id} in service layer:`,
        error,
      );
      throw error;
    }
  },

  /**
   * Removes or clears a customer price row from the Google Sheet by ID.
   */
  delete: async (id: string): Promise<void> => {
    try {
      await axios.delete(`${API_BASE_URL}/${id}`);
    } catch (error) {
      console.error(
        `Failed to delete customer price with ID ${id} in service layer:`,
        error,
      );
      throw error;
    }
  },
};

export default customerPriceService;
