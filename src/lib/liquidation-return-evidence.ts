import { Readable } from "node:stream";
import { getDriveUploadClient } from "@/lib/googleSheets";

export function validateReturnImage(buffer: Buffer): string {
  if (buffer.length > 10 * 1024 * 1024) throw new Error("Evidence must be 10 MB or smaller.");
  if (buffer.length >= 12) {
    if (buffer.subarray(0, 8).equals(Buffer.from("89504e470d0a1a0a", "hex"))) return "image/png";
    if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return "image/jpeg";
    if (buffer.toString("ascii", 0, 4) === "RIFF" && buffer.toString("ascii", 8, 12) === "WEBP") return "image/webp";
  }
  throw new Error("Upload a PNG, JPEG or WebP screenshot/photo.");
}

export async function uploadReturnEvidence(liquidationId: string, buffer: Buffer, name: string) {
  const mimeType = validateReturnImage(buffer);
  const drive = await getDriveUploadClient();
  const safeName = name.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 100) || "return-evidence";
  const file = await drive.files.create({
    requestBody: {
      name: `liquidation-return_${liquidationId}_${Date.now()}_${safeName}`,
      mimeType,
      // My Drive root avoids inheriting the public receipt folder's permissions.
      properties: { purpose: "liquidation-return", liquidationId },
    },
    media: { mimeType, body: Readable.from(buffer) },
    fields: "id",
  });
  if (!file.data.id) throw new Error("Evidence upload did not return a file ID.");
  return { fileId: file.data.id, name: safeName };
}
