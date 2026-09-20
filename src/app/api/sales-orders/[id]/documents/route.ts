import { NextResponse } from "next/server";
import { requireSalesPermission, salesErrorResponse, toActor } from "@/lib/salesOrders/http-helpers";
import { attachDocument } from "@/lib/salesOrders/service";
import { parseDocumentInput } from "@/lib/salesOrders/validation";
import { getDriveUploadClient } from "@/lib/googleSheets";
import { Readable } from "node:stream";

const DEFAULT_SALES_ORDER_DRIVE_FOLDER_ID = "19919wVs7xuxSr1CCxPQjPU6xslnulWd9";
const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;
const ALLOWED_MIME_TYPES = new Set([
  "application/pdf", "image/jpeg", "image/png", "image/webp",
  "application/msword", "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
]);

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireSalesPermission("so.attach");
  if (auth.response) return auth.response;
  try {
    const { id } = await params;
    const contentType = request.headers.get("content-type") ?? "";
    if (contentType.includes("multipart/form-data")) {
      const form = await request.formData();
      const file = form.get("file");
      if (!(file instanceof File) || file.size === 0) {
        return NextResponse.json({ code: "VALIDATION", message: "Choose a file to upload." }, { status: 422 });
      }
      if (file.size > MAX_UPLOAD_BYTES) {
        return NextResponse.json({ code: "VALIDATION", message: "Document must be 10 MB or smaller." }, { status: 422 });
      }
      if (!ALLOWED_MIME_TYPES.has(file.type)) {
        return NextResponse.json({ code: "VALIDATION", message: "Upload a PDF, JPG, PNG, WebP, DOC, or DOCX file." }, { status: 422 });
      }
      const safeName = file.name.replace(/[^a-zA-Z0-9._ -]/g, "_").slice(0, 160) || "sales-order-document";
      const drive = await getDriveUploadClient();
      const folderId = process.env.GOOGLE_DRIVE_SALES_ORDERS_FOLDER_ID?.trim() || DEFAULT_SALES_ORDER_DRIVE_FOLDER_ID;
      const uploaded = await drive.files.create({
        requestBody: { name: safeName, parents: [folderId] },
        media: { mimeType: file.type, body: Readable.from(Buffer.from(await file.arrayBuffer())) },
        fields: "id,name,webViewLink",
      });
      const driveFileId = uploaded.data.id;
      if (!driveFileId) throw new Error("Drive did not return a file ID.");
      try {
        const document = await attachDocument(toActor(auth.session), id, {
          commandId: String(form.get("commandId") || crypto.randomUUID()),
          documentType: String(form.get("documentType") || "OTHER"),
          externalDocumentNo: String(form.get("externalDocumentNo") || ""),
          driveFileId,
          externalUrl: uploaded.data.webViewLink || `https://drive.google.com/file/d/${driveFileId}/view`,
          fileName: uploaded.data.name || safeName,
          mimeType: file.type,
          orderVersion: Number(form.get("orderVersion") || 0),
        });
        return NextResponse.json({ success: true, document }, { status: 201 });
      } catch (error) {
        await drive.files.delete({ fileId: driveFileId }).catch(() => undefined);
        throw error;
      }
    }

    const input = parseDocumentInput(await request.json());
    const document = await attachDocument(toActor(auth.session), id, {
      commandId: input.commandId,
      documentType: input.documentType,
      externalDocumentNo: input.externalDocumentNo,
      driveFileId: input.driveFileId,
      externalUrl: input.externalUrl,
      fileName: input.fileName,
      mimeType: input.mimeType,
      orderVersion: input.orderVersion,
    });
    return NextResponse.json({ success: true, document }, { status: 201 });
  } catch (error) {
    return salesErrorResponse(error);
  }
}
