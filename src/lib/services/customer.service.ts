import axios from "axios";
import {
  Customer,
  CreateCustomerPayload,
  UpdateCustomerPayload,
} from "@/types/customer";

const API_BASE_URL = "/api/customers";

const customerService = {
  /**
   * Fetches all rows mapped to Customer items from the Google Sheet
   */
  getAll: async (): Promise<Customer[]> => {
    try {
      const response = await axios.get<Customer[]>(API_BASE_URL);
      // Ensure the incoming data is safely an array
      return Array.isArray(response.data) ? response.data : [];
    } catch (error) {
      console.error("Failed to fetch customers in service layer:", error);
      return [];
    }
  },

  /**
   * Appends a new customer row to the Google Sheet
   */
  create: async (payload: CreateCustomerPayload): Promise<Customer | null> => {
    try {
      const response = await axios.post<Customer>(API_BASE_URL, payload);
      return response.data;
    } catch (error) {
      console.error("Failed to create customer in service layer:", error);
      throw error;
    }
  },

  /**
   * Updates an existing customer row in the Google Sheet using their ID
   */
  update: async (payload: UpdateCustomerPayload): Promise<Customer | null> => {
    try {
      // Sends a PUT request with the user's updated fields bundle
      const response = await axios.put<Customer>(
        `${API_BASE_URL}/${payload.id}`,
        payload,
      );
      return response.data;
    } catch (error) {
      console.error(
        `Failed to update customer with ID ${payload.id} in service layer:`,
        error,
      );
      throw error;
    }
  },

  /**
   * Removes or clears a customer row from the Google Sheet by ID
   */
  delete: async (id: string): Promise<void> => {
    try {
      await axios.delete(`${API_BASE_URL}/${id}`);
    } catch (error) {
      console.error(
        `Failed to delete customer with ID ${id} in service layer:`,
        error,
      );
      throw error;
    }
  },
};

export default customerService;
