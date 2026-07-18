import axios from "axios";
import type {
  PublicUser,
  CreateUserInput,
  UpdateUserInput,
} from "@/types/user";

// Configure an axios instance with default configurations
const api = axios.create({
  baseURL: "/api",
  withCredentials: true, // Automatically includes cookies for cross-origin or explicit route sessions
  headers: {
    "Content-Type": "application/json",
  },
});

export const userService = {
  /**
   * Fetches all active application users
   */
  async getAllUsers(): Promise<PublicUser[]> {
    try {
      const response = await api.get<PublicUser[]>("/users");
      return response.data;
    } catch (error: any) {
      throw new Error(error.response?.data?.error || "Failed to load users.");
    }
  },

  /**
   * Handles user creation (POST)
   */
  async createUser(payload: CreateUserInput): Promise<PublicUser> {
    try {
      const response = await api.post<PublicUser>("/users", payload);
      return response.data;
    } catch (error: any) {
      throw new Error(error.response?.data?.error || "Failed to create user.");
    }
  },

  /**
   * Handles updating an existing user profile (PUT)
   */
  async updateUser(id: string, payload: UpdateUserInput): Promise<PublicUser> {
    try {
      const response = await api.put<PublicUser>(`/users/${id}`, payload);
      return response.data;
    } catch (error: any) {
      throw new Error(error.response?.data?.error || "Failed to update user.");
    }
  },

  /**
   * Deletes a user profile (DELETE)
   */
  async deleteUser(id: string): Promise<void> {
    try {
      await api.delete(`/users/${id}`);
    } catch (error: any) {
      throw new Error(error.response?.data?.error || "Failed to delete user.");
    }
  },

  /**
   * Terminates active authorization session
   */
  async logout(): Promise<void> {
    try {
      await api.post("/auth/logout");
    } catch (error) {
      // Fail silently on logout networking errors to guarantee frontend transitions anyway
      console.error("Logout network cleanup omitted: ", error);
    }
  },

  /**
   * Fetches a user by their username
   */
  async getUserByUsername(username: string): Promise<PublicUser | null> {
    try {
      const response = await api.get<PublicUser>(
        `/users?username=${encodeURIComponent(username)}`,
      );
      return response.data;
    } catch (error: any) {
      if (error.response?.status === 404) return null;
      throw new Error(
        error.response?.data?.error || "Failed to fetch user by username.",
      );
    }
  },

  /**
   * Fetches a user by their ID
   */
  async getUserById(id: string): Promise<PublicUser | null> {
    try {
      const response = await api.get<PublicUser>(
        `/users/${encodeURIComponent(id)}`,
      );
      return response.data;
    } catch (error: any) {
      if (error.response?.status === 404) return null;
      throw new Error(
        error.response?.data?.error || "Failed to fetch user by ID.",
      );
    }
  },
};

export default userService;
