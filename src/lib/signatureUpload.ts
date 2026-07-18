import { getSheetsAndDriveClient } from "@/lib/googleSheets";
import { Readable } from "stream";

/**
 * Uploads an e-Signature image to the designated Google Drive folder.
 * The image should be a transparent PNG for use on quotation templates.
 *
 * @returns The Drive file ID of the uploaded signature image.
 */
export async function uploadSignatureImage(params: {
  imageBuffer: Buffer;
  username: string;
}): Promise<{ fileId: string; webViewLink: string }> {
  const { drive } = await getSheetsAndDriveClient();
  const folderId = process.env.GOOGLE_DRIVE_SIGNATURE_FOLDER_ID;

  if (!folderId) {
    throw new Error(
      "Missing GOOGLE_DRIVE_SIGNATURE_FOLDER_ID environment variable.",
    );
  }

  const fileName = `signature_${params.username}.png`;

  // Delete any existing signature file for this user to avoid duplicates
  try {
    const existing = await drive.files.list({
      q: `name = '${fileName}' and '${folderId}' in parents and trashed = false`,
      fields: "files(id)",
      spaces: "drive",
    });

    if (existing.data.files && existing.data.files.length > 0) {
      for (const file of existing.data.files) {
        if (file.id) {
          await drive.files.delete({ fileId: file.id });
        }
      }
    }
  } catch (err) {
    console.warn("Could not clean up existing signature files:", err);
  }

  const uploadedFile = await drive.files.create({
    requestBody: {
      name: fileName,
      parents: [folderId],
      mimeType: "image/png",
    },
    media: {
      mimeType: "image/png",
      body: Readable.from(params.imageBuffer),
    },
    fields: "id, webViewLink",
  });

  // Make publicly viewable (anyone with link can view)
  try {
    await drive.permissions.create({
      fileId: uploadedFile.data.id!,
      requestBody: { role: "reader", type: "anyone" },
    });
  } catch (permError) {
    console.warn(
      "Could not set public read permission on signature file:",
      permError,
    );
  }

  return {
    fileId: uploadedFile.data.id || "",
    webViewLink: uploadedFile.data.webViewLink || "",
  };
}

/**
 * Generates a proxy image URL that routes through our own server,
 * avoiding Google Drive's CORS restrictions.
 */
export function getDriveImageUrl(fileId: string): string {
  return `/api/images/drive/${fileId}`;
}
