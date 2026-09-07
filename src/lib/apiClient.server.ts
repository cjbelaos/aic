import axios, { AxiosInstance, AxiosRequestConfig } from "axios";
import { cookies, headers } from "next/headers";
import { ApiError } from "./apiClient";

async function getBaseUrl() {
  if (process.env.INTERNAL_API_URL) return process.env.INTERNAL_API_URL;
  if (process.env.NEXT_PUBLIC_API_URL?.startsWith("http")) {
    return process.env.NEXT_PUBLIC_API_URL;
  }

  // Await headers() for Next.js 15+ compatibility
  const headerList = await headers();
  const host = headerList.get("host");
  const protocol = headerList.get("x-forwarded-proto") || "http";

  return `${protocol}://${host}${process.env.NEXT_PUBLIC_API_URL || "/api"}`;
}

export async function createServerApiClient(): Promise<AxiosInstance> {
  // Await async server functions
  const cookieStore = await cookies();
  const reqHeaders = await headers();
  const baseURL = await getBaseUrl();

  const instance = axios.create({
    baseURL,
    headers: {
      "Content-Type": "application/json",
      Cookie: cookieStore.toString(),
      Authorization: reqHeaders.get("authorization") || "",
    },
    timeout: 30000,
  });

  return instance;
}

export async function serverApiRequest<T>(
  config: AxiosRequestConfig,
): Promise<T> {
  try {
    const client = await createServerApiClient();
    const response = await client.request<T>(config);
    return response.data;
  } catch (error) {
    if (axios.isAxiosError(error)) {
      const message =
        error.response?.data?.message ||
        error.response?.data?.error ||
        error.message;
      throw new ApiError(message, error.response?.status, error.response?.data);
    }
    throw error;
  }
}
