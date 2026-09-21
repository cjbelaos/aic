// Service Reports — Google Drive adapter. All Service Report artifacts live in
// the private folder configured by GOOGLE_DRIVE_SERVICE_REPORTS_FOLDER_ID.
// Files stay PRIVATE: no "anyone" permission is granted. Display goes through
// the authenticated application proxy /api/images/drive/[fileId]. Signature
// bytes never reach Google Sheets or logs — only the Drive ID, URL, SHA-256
// hash, MIME type and size are persisted.

import { getDriveUploadClient } from "@/lib/googleSheets";
import { Readable } from "stream";
import { SERVICE_REPORTS_DRIVE_FOLDER_ENV } from "./constants";
import type { ServiceReportDrive } from "./storeTypes";
import { dependencyUnavailable } from "./errors";

function serviceReportsFolderId(env: Record<string, string | undefined> = process.env as Record<string, string | undefined>): string {
  const folderId = env[SERVICE_REPORTS_DRIVE_FOLDER_ENV]?.trim();
  if (!folderId) {
    throw dependencyUnavailable(
      `Missing ${SERVICE_REPORTS_DRIVE_FOLDER_ENV} environment variable. Service Reports cannot store signatures or PDFs.`,
    );
  }
  return folderId;
}

export function createServiceReportDrive(
  env: Record<string, string | undefined> = process.env as Record<string, string | undefined>,
): ServiceReportDrive {
  const folderId = serviceReportsFolderId(env);
  return {
    async uploadPrivateFile(input) {
      const drive = await getDriveUploadClient();
      const created = await drive.files.create({
        requestBody: {
          name: input.fileName,
          parents: [folderId],
          mimeType: input.mimeType,
          description: input.description,
        },
        media: { mimeType: input.mimeType, body: Readable.from(input.buffer) },
        fields: "id",
        supportsAllDrives: true,
      });
      const fileId = created.data.id;
      if (!fileId) throw dependencyUnavailable("Google Drive did not return a file ID for the upload.");
      // NO permissions.create call: the file stays private.
      return { fileId, url: `/api/images/drive/${fileId}` };
    },
    async deleteFile(fileId) {
      const drive = await getDriveUploadClient();
      await drive.files.delete({ fileId, supportsAllDrives: true });
    },
    async fetchFileBase64(fileId) {
      const drive = await getDriveUploadClient();
      const response = await drive.files.get({ fileId, alt: "media" }, { responseType: "arraybuffer" });
      return Buffer.from(response.data as ArrayBuffer).toString("base64");
    },
  };
}