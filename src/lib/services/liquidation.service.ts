import axios from "axios";
import type { LiquidationFull, ReceiptItemInput } from "@/types/liquidation";

const api = axios.create({
  baseURL: "/api",
  withCredentials: true,
  headers: { "Content-Type": "application/json" },
});

export interface CreateLiquidationResponse {
  success: boolean;
  liquidationId: string;
  totalAmount: number;
  itemCount: number;
}

export interface UploadReceiptResponse {
  success: boolean;
  receiptImageUrl: string;
  proxyUrl: string;
  fileName: string;
}

/**
 * Downsizes and compresses an image file client-side before upload.
 * Phone cameras produce 5–15 MB photos that can exceed upload limits;
 * receipts are readable at ~1280px and JPEG quality 0.7.
 */
async function compressImage(file: File): Promise<File> {
  if (!file.type.startsWith("image/")) return file;

  // Skip compression for already-small files.
  if (file.size <= 1.5 * 1024 * 1024) return file;

  try {
    const dataUrl = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = () => reject(new Error("Failed to read image."));
      reader.readAsDataURL(file);
    });

    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = () => reject(new Error("Failed to load image."));
      image.src = dataUrl;
    });

    const MAX_DIMENSION = 1280;
    let { width, height } = img;
    if (width > MAX_DIMENSION || height > MAX_DIMENSION) {
      const scale = MAX_DIMENSION / Math.max(width, height);
      width = Math.round(width * scale);
      height = Math.round(height * scale);
    }

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) return file;
    ctx.drawImage(img, 0, 0, width, height);

    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, "image/jpeg", 0.7),
    );
    if (!blob) return file;

    // Keep the original filename but with a .jpg extension (canvas output).
    const name = file.name.replace(/\.[^.]+$/, "") + ".jpg";
    return new File([blob], name, { type: "image/jpeg" });
  } catch {
    // On any compression failure, upload the original file unchanged.
    return file;
  }
}

export const liquidationService = {
  /**
   * Creates a new liquidation batch. UserId is captured server-side.
   */
  async create(items: ReceiptItemInput[]): Promise<CreateLiquidationResponse> {
    const res = await api.post<CreateLiquidationResponse>("/liquidations", {
      items,
    });
    return res.data;
  },

  /**
   * Lists the current user's liquidations with their receipt items.
   */
  async getMyLiquidations(): Promise<LiquidationFull[]> {
    const res = await api.get<{
      success: boolean;
      liquidations: LiquidationFull[];
    }>("/liquidations");
    return res.data.liquidations;
  },

  /**
   * Uploads a single receipt file (image/PDF) and returns its public URL.
   * Images above 1.5 MB are compressed client-side to avoid hitting
   * request-body/upload size limits, which is the most common failure for
   * phone-camera photos.
   */
  async uploadReceipt(file: File): Promise<UploadReceiptResponse> {
    const formData = new FormData();
    formData.append("file", await compressImage(file));
    try {
      const res = await api.post<UploadReceiptResponse>(
        "/liquidations/upload",
        formData,
        {
          headers: { "Content-Type": "multipart/form-data" },
        },
      );
      return res.data;
    } catch (error) {
      // Surface the real error message returned by the API route.
      if (axios.isAxiosError(error)) {
        const serverMessage = error.response?.data?.error;
        throw new Error(serverMessage || error.message);
      }
      throw error;
    }
  },
};