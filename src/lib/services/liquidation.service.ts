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
  controlNo: string;
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
   * controlNo links the liquidation to the technician's FTI request.
   * totalAmountRequested is the manual amount for "Other" liquidations
   * (ignored when a ControlNo exists — the FTI TotalAmount is used instead).
   */
  async createDraft(controlNo: string, totalAmountRequested?: number) {
    return (
      await api.post("/liquidations", {
        action: "create",
        controlNo,
        totalAmountRequested,
      })
    ).data;
  },
  /**
   * Updates the TotalAmountRequested (manual amount for "Other" liquidations
   * without an FTI ControlNo).
   */
  async updateRequestedAmount(
    liquidationId: string,
    totalAmountRequested: number,
  ) {
    return (
      await api.post("/liquidations", {
        action: "update",
        liquidationId,
        totalAmountRequested,
      })
    ).data;
  },
  async addItem(liquidationId: string, items: ReceiptItemInput[]) {
    return (
      await api.post("/liquidations", {
        action: "add-item",
        liquidationId,
        items,
      })
    ).data;
  },
  async replace(liquidationId: string, items: ReceiptItemInput[]) {
    return (
      await api.post("/liquidations", {
        action: "replace",
        liquidationId,
        items,
      })
    ).data;
  },
  async submit(liquidationId: string) {
    return (
      await api.post("/liquidations", { action: "submit", liquidationId })
    ).data;
  },
  async approve(
    liquidationId: string,
    action: "approve" | "request_change" | "reject",
    comment?: string,
  ) {
    return (
      await api.post("/liquidations", {
        action: "approve",
        liquidationId,
        approval: { action, comment },
      })
    ).data;
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
   * Returns the current user's liquidation (with receipt items) for an FTI
   * ControlNo. Used to restore existing receipts when a ControlNo that
   * already has a SAVED/SUBMITTED/… liquidation is re-selected.
   */
  async getByControlNo(controlNo: string): Promise<LiquidationFull | null> {
    const res = await api.get<{
      success: boolean;
      liquidations: LiquidationFull[];
    }>("/liquidations", {
      params: { controlNo },
    });
    return res.data.liquidations[0] || null;
  },

  /**
   * Returns the current user's "Other" liquidations (no FTI ControlNo),
   * with their receipt items, so an existing no-FTI draft can be reopened
   * and further edited.
   */
  async getOtherLiquidations(): Promise<LiquidationFull[]> {
    const mine = await this.getMyLiquidations();
    return mine.filter((l) => !l.controlNo);
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
