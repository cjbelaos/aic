import { getDriveUploadClient } from "@/lib/googleSheets";
import { Readable } from "stream";

export interface ReceiptUploadResult {
  fileId: string;
  /** Public web URL stored in ReceiptItems.ReceiptImageUrl. */
  webViewLink: string;
  /** Proxy URL routed through our own server (avoids Drive CORS issues). */
  proxyUrl: string;
}

/**
 * Uploads a receipt file (image or PDF) to the designated Google Drive folder
 * and makes it publicly viewable. Returns the Drive file ID plus the public
 * webViewLink that gets persisted in the ReceiptItems sheet.
 */
export async function uploadReceiptFile(params: {
  fileBuffer: Buffer;
  filename: string;
  mimeType: string;
  liquidationId?: string;
}): Promise<ReceiptUploadResult> {
  // Service accounts have no Drive storage quota, so uploads must use the
  // OAuth2 refresh-token client which acts as a real user with quota.
  const drive = await getDriveUploadClient();
  const folderId = process.env.GOOGLE_DRIVE_RECEIPT_FOLDER_ID;

  if (!folderId) {
    throw new Error(
      "Missing GOOGLE_DRIVE_RECEIPT_FOLDER_ID environment variable.",
    );
  }

  const safeBase = params.filename
    .replace(/[^a-zA-Z0-9._-]/g, "_")
    .slice(0, 80);
  const fileName = `${params.liquidationId || "receipt"}_${Date.now()}_${safeBase}`;

  const uploadedFile = await drive.files.create({
    requestBody: {
      name: fileName,
      parents: [folderId],
      mimeType: params.mimeType,
    },
    media: {
      mimeType: params.mimeType,
      body: Readable.from(params.fileBuffer),
    },
    fields: "id, webViewLink",
  });

  const fileId = uploadedFile.data.id || "";

  // Make publicly viewable (anyone with link can view)
  try {
    await drive.permissions.create({
      fileId,
      requestBody: { role: "reader", type: "anyone" },
    });
  } catch (permError) {
    console.warn(
      "Could not set public read permission on receipt file:",
      permError,
    );
  }

  return {
    fileId,
    webViewLink: uploadedFile.data.webViewLink || "",
    proxyUrl: `/api/images/drive/${fileId}`,
  };
}

/**
 * Deletes a previously uploaded receipt file from Google Drive. Used to
 * roll back an orphaned file when the corresponding Google Sheet write fails,
 * so the Drive upload and sheet record succeed or fail together.
 */
export async function deleteReceiptFile(fileId: string): Promise<void> {
  if (!fileId) return;
  const drive = await getDriveUploadClient();
  await drive.files.delete({ fileId });
}