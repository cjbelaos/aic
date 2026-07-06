import axios, { AxiosError } from "axios";

export interface ApiResponse<T> {
  isSuccess: boolean;
  result?: T;
  errorMessages?: string[];
}

export interface AuthUser {
  userName: string;
  role: string;
}

const authService = {
  /**
   * Hits the internal Next.js API Route handler
   */
  async login(payload: {
    username: string;
    password: string;
  }): Promise<ApiResponse<AuthUser>> {
    try {
      // Axios automatically stringifies payloads and sets Content-Type to application/json
      const response = await axios.post<ApiResponse<AuthUser>>(
        "/api/auth/login",
        payload,
      );
      console.log("Login response:", response);
      return response.data;
    } catch (error) {
      const axiosError = error as AxiosError<ApiResponse<AuthUser>>;

      // If the server responded with an error status code (e.g., 400, 401)
      if (axiosError.response && axiosError.response.data) {
        return {
          isSuccess: false,
          errorMessages: axiosError.response.data.errorMessages || [
            "Invalid credentials.",
          ],
        };
      }

      // Network or setup error
      return {
        isSuccess: false,
        errorMessages: [
          "Unable to connect to the server. Please check your network connection.",
        ],
      };
    }
  },

  /**
   * Verifies the current user's active session state
   */
  async me(): Promise<ApiResponse<AuthUser>> {
    try {
      const response = await axios.get<ApiResponse<AuthUser>>("/api/auth/me");
      return response.data;
    } catch (error) {
      const axiosError = error as AxiosError<ApiResponse<AuthUser>>;

      if (axiosError.response && axiosError.response.data) {
        return {
          isSuccess: false,
          errorMessages: axiosError.response.data.errorMessages || [
            "Session invalid or expired.",
          ],
        };
      }

      return {
        isSuccess: false,
        errorMessages: ["Unable to verify session with the server."],
      };
    }
  },

  /**
   * Terminates the current user session
   */
  async logout(): Promise<ApiResponse<null>> {
    try {
      await axios.post("/api/auth/logout");
      return { isSuccess: true };
    } catch {
      return { isSuccess: false, errorMessages: ["Logout failed."] };
    }
  },
};

export default authService;
