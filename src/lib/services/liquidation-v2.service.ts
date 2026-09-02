import axios from "axios";
import type { LiquidationFullV2, ReceiptItemV2Input } from "@/types/liquidation-v2";

/**
 * ISOLATED SANDBOX CLIENT SERVICE — hits `/api/liquidation-v2` only.
 * Mirrors the production `liquidation.service.ts` without touching it.
 */
const api = axios.create({
  baseURL: "/api",
  withCredentials: true,
  headers: { "Content-Type": "application/json" },
});

// Surface the server's actual error message instead of a generic
// "Request failed with status code 400".
api.interceptors.response.use(
  (res) => res,
  (error) => {
    const serverMessage =
      (typeof error?.response?.data?.error === "string" &&
        error.response.data.error) ||
      error?.message ||
      "Request failed.";
    return Promise.reject(new Error(serverMessage));
  },
);

export interface CreateLiquidationV2Response {
  success: boolean;
  liquidationId: string;
  controlNo: string;
  totalAmount: number;
  itemCount: number;
}

export interface UploadReceiptV2Response {
  success: boolean;
  fileId: string;
  receiptImageUrl: string;
  proxyUrl: string;
  fileName: string;
}

/**
 * Downsizes and compresses an image file client-side before upload.
 * (Duplicated from the production service; keep these two in sync.)
 */
async function compressImage(file: File): Promise<File> {
  if (!file.type.startsWith("image/")) return file;
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

    const name = file.name.replace(/\.[^.]+$/, "") + ".jpg";
    return new File([blob], name, { type: "image/jpeg" });
  } catch {
    return file;
  }
}

export const liquidationV2Service = {
  /**
   * Creates a new V2 liquidation batch. UserId is captured server-side.
   * controlNo is a plain optional reference (no FTI linkage in the sandbox).
   */
  async createDraft(
    controlNo: string,
    totalAmountRequested?: number,
  ): Promise<{ liquidationId: string }> {
    const res = await api.post<{
      success: boolean;
      liquidationId: string;
      status: string;
    }>("/liquidation-v2", {
      action: "create",
      controlNo,
      totalAmountRequested,
    });
    return { liquidationId: res.data.liquidationId };
  },

  /** Appends one or more V2 receipt items to the given batch. */
  async addItem(
    liquidationId: string,
    items: ReceiptItemV2Input[],
  ): Promise<{ totalAmount: number; itemCount: number }> {
    const res = await api.post<{
      success: boolean;
      totalAmount: number;
      itemCount: number;
    }>("/liquidation-v2", {
      action: "add-item",
      liquidationId,
      items,
    });
    return { totalAmount: res.data.totalAmount, itemCount: res.data.itemCount };
  },

  /** Replaces every receipt item of a V2 liquidation (edit/delete persistence). */
  async replace(
    liquidationId: string,
    items: ReceiptItemV2Input[],
  ): Promise<void> {
    await api.post("/liquidation-v2", {
      action: "replace",
      liquidationId,
      items,
    });
  },

  /** Persists the manual TotalAmountRequested for a V2 liquidation. */
  async updateRequestedAmount(
    liquidationId: string,
    totalAmountRequested: number,
  ): Promise<void> {
    await api.post("/liquidation-v2", {
      action: "update",
      liquidationId,
      totalAmountRequested,
    });
  },

  /** Flips a V2 liquidation status SAVED → SUBMITTED (auto-assigns approver). */
  async submit(liquidationId: string): Promise<{ liquidationId: string }> {
    const res = await api.post<{ success: boolean; liquidationId: string }>(
      "/liquidation-v2",
      { action: "submit", liquidationId },
    );
    return { liquidationId: res.data.liquidationId };
  },

  /** Approves / requests change / rejects a V2 liquidation. */
  async approve(
    liquidationId: string,
    action: "approve" | "request_change" | "reject",
    comment?: string,
  ) {
    return (
      await api.post("/liquidation-v2", {
        action: "approve",
        liquidationId,
        approval: { action, comment },
      })
    ).data;
  },

  /** Returns the current user's V2 liquidations (with receipt items). */
  async getMyLiquidations(): Promise<LiquidationFullV2[]> {
    const res = await api.get<{
      success: boolean;
      liquidations: LiquidationFullV2[];
    }>("/liquidation-v2");
    return res.data.liquidations;
  },

  /** Returns the current user's liquidation for a ControlNo, or null. */
  async getByControlNo(controlNo: string): Promise<LiquidationFullV2 | null> {
    const res = await api.get<{
      success: boolean;
      liquidations: LiquidationFullV2[];
    }>("/liquidation-v2", {
      params: { controlNo },
    });
    return res.data.liquidations[0] || null;
  },

  /** Returns the current user's "Other" (no ControlNo) V2 liquidations. */
  async getOtherLiquidations(): Promise<LiquidationFullV2[]> {
    const mine = await this.getMyLiquidations();
    return mine.filter((l) => !l.controlNo);
  },

  /** Admin view — ALL V2 liquidations (including other users). */
  async getAllLiquidations(): Promise<LiquidationFullV2[]> {
    const res = await api.get<{
      success: boolean;
      liquidations: LiquidationFullV2[];
    }>("/liquidation-v2", { params: { all: "true" } });
    return res.data.liquidations;
  },

  /** BOD view — all SUBMITTED V2 liquidations. */
  async getBodLiquidations(): Promise<LiquidationFullV2[]> {
    const res = await api.get<{
      success: boolean;
      liquidations: LiquidationFullV2[];
    }>("/liquidation-v2", { params: { bod: "true" } });
    return res.data.liquidations;
  },

  /** Deletes a V2 liquidation (parent + receipt items). Owner only. */
  async deleteLiquidation(liquidationId: string) {
    return (
      await api.post("/liquidation-v2", {
        action: "delete",
        liquidationId,
      })
    ).data;
  },

  /**
   * Uploads a single receipt file (image/PDF) for the V2 flow and returns
   * its public URL. Images above 1.5 MB are compressed client-side.
   */
  async uploadReceipt(file: File): Promise<UploadReceiptV2Response> {
    const formData = new FormData();
    formData.append("file", await compressImage(file));
    try {
      const res = await api.post<UploadReceiptV2Response>(
        "/liquidation-v2/upload",
        formData,
        {
          headers: { "Content-Type": "multipart/form-data" },
        },
      );
      return res.data;
    } catch (error) {
      if (axios.isAxiosError(error)) {
        const serverMessage = error.response?.data?.error;
        throw new Error(serverMessage || error.message);
      }
      throw error;
    }
  },

  /** Deletes a single uploaded receipt file from Google Drive (rollback). */
  async deleteReceipt(fileId: string) {
    if (!fileId) return;
    await api.delete("/liquidation-v2/upload", {
      params: { fileId },
    });
  },
};

export default liquidationV2Service;