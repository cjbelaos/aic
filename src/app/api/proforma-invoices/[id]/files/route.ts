import { NextResponse } from "next/server";
import { Readable } from "node:stream";
import { requireAuthenticatedSession } from "@/lib/auth/session";
import { getDriveUploadClient, escapeDriveQueryValue } from "@/lib/googleSheets";
import { getProforma, recordProformaFile } from "@/lib/proforma/service";
import { ProformaError } from "@/lib/proforma/domain";
import { proformaError } from "@/lib/proforma/http";
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const session = await requireAuthenticatedSession();
  if (session instanceof Response) return session;
  try {
    const { id } = await context.params;
    const invoice = await getProforma(id);
    if (invoice.status !== "ISSUED") throw new ProformaError("Issue the proforma before saving files.");
    const form = await request.formData();
    const file = form.get("file");
    const kind = form.get("kind") === "pdf" ? "pdfLink" : form.get("kind") === "scan" ? "scanLink" : null;
    if (!kind || !(file instanceof File) || !["application/pdf", "image/jpeg", "image/png", "image/webp"].includes(file.type) || file.size <= 0 || file.size > 10 * 1024 * 1024 || (kind === "pdfLink" && file.type !== "application/pdf")) throw new ProformaError("Upload a PDF or image up to 10 MB.");
    if (Number(form.get("version")) !== invoice.version) throw new ProformaError("The proforma changed. Reopen it before saving files.", 409);
    const buffer = Buffer.from(await file.arrayBuffer());
    if (file.type === "application/pdf" && !buffer.subarray(0, 5).equals(Buffer.from("%PDF-"))) throw new ProformaError("The file is not a valid PDF.");
    const drive = await getDriveUploadClient();
    const folderName = "Proforma Invoices";
    let folderId = process.env.PROFORMA_DRIVE_FOLDER_ID;
    if (!folderId) {
      const folders = await drive.files.list({ q: `name = '${escapeDriveQueryValue(folderName)}' and mimeType = 'application/vnd.google-apps.folder' and 'root' in parents and trashed = false`, fields: "files(id)" });
      folderId = folders.data.files?.[0]?.id || (await drive.files.create({ requestBody: { name: folderName, mimeType: "application/vnd.google-apps.folder" }, fields: "id" })).data.id || undefined;
    }
    if (!folderId) throw new Error("Unable to create Proforma Invoices Drive folder.");
    const extension = file.type === "application/pdf" ? "pdf" : file.type.split("/")[1];
    const name = `${invoice.invoiceNo}_${kind === "pdfLink" ? "PDF" : "SCAN"}.${extension}`;
    const existingId = invoice[kind].match(/\/d\/([a-zA-Z0-9_-]+)/)?.[1];
    const uploaded = existingId
      ? await drive.files.update({ fileId: existingId, requestBody: { name }, media: { mimeType: file.type, body: Readable.from(buffer) }, fields: "id,webViewLink" })
      : await drive.files.create({ requestBody: { name, parents: [folderId] }, media: { mimeType: file.type, body: Readable.from(buffer) }, fields: "id,webViewLink" });
    const link = uploaded.data.webViewLink || `https://drive.google.com/file/d/${uploaded.data.id}/view`;
    return NextResponse.json(await recordProformaFile(id, kind, link, invoice.version));
  } catch (error) { return proformaError(error); }
}
