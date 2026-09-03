import { NextRequest, NextResponse } from "next/server";
import { Readable } from "stream";
import { requireAuthenticatedSession } from "@/lib/auth/session";
import {
  getDriveUploadClient,
  getDatabaseSpreadsheetId,
  getSheetsClient,
} from "@/lib/googleSheets";

const SERVICE_INVOICE_DRIVE_FOLDER_ID = "166LGOl4qTL4Ukabnrk335OT0ccLQnCq_";
const SERVICE_INVOICES_SHEET = "ServiceInvoices";

/**
 * POST /api/service-invoices/upload-scanned
 * Uploads a scanned Service Invoice (image or PDF) to Google Drive and stores
 * its link in the ServiceInvoices sheet (column J) for the given invoice number.
 *
 * Body: multipart/form-data with fields `file` (required) and `invoiceNo`.
 * Returns: { success, fileLink, fileName, fileId }
 */
export async function POST(req: NextRequest) {
  const session = await requireAuthenticatedSession();
  if (session instanceof Response) return session;

  let formData: FormData;
  try {
    formData = await req.formData();
  } catch {
    return NextResponse.json(
      { error: "Invalid multipart form data." },
      { status: 400 },
    );
  }

  const file = formData.get("file");
  const invoiceNo = (formData.get("invoiceNo") || "").toString().trim();

  if (!invoiceNo) {
    return NextResponse.json(
      { error: "invoiceNo is required." },
      { status: 400 },
    );
  }
  if (!file || typeof file === "string") {
    return NextResponse.json(
      { error: "Missing file field in upload." },
      { status: 400 },
    );
  }

  // Reasonable size cap (10 MB) so we don't stream huge files.
  if (file.size > 10 * 1024 * 1024) {
    return NextResponse.json(
      { error: "File must be 10 MB or smaller." },
      { status: 400 },
    );
  }

  try {
    const sheets = await getSheetsClient();
    const spreadsheetId = await getDatabaseSpreadsheetId();

    // 1. Verify the invoice exists before uploading.
    const allRows = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: `${SERVICE_INVOICES_SHEET}!A2:A`,
    });
    const rows = allRows.data.values || [];
    const siRowIdx = rows.findIndex(
      (row) => String(row[0] ?? "").trim() === invoiceNo,
    );
    if (siRowIdx < 0) {
      return NextResponse.json(
        { error: `Invoice "${invoiceNo}" not found.` },
        { status: 404 },
      );
    }

    // 2. Upload the scanned file to Drive.
    const buffer = Buffer.from(await file.arrayBuffer());
    const safeBase = file.name
      .replace(/[^a-zA-Z0-9._-]/g, "_")
      .slice(0, 80);
    const fileName = `SI-SCANNED_${invoiceNo}_${Date.now()}_${safeBase}`;

    const drive = await getDriveUploadClient();
    const uploadedFile = await drive.files.create({
      requestBody: {
        name: fileName,
        parents: [SERVICE_INVOICE_DRIVE_FOLDER_ID],
        mimeType: file.type || "application/octet-stream",
      },
      media: {
        mimeType: file.type || "application/octet-stream",
        body: Readable.from(buffer),
      },
      fields: "id, webViewLink",
    });

    const fileId = uploadedFile.data.id || "";
    const fileLink = `https://drive.google.com/file/d/${fileId}/view`;

    // Make it publicly viewable (anyone with link can view).
    try {
      await drive.permissions.create({
        fileId,
        requestBody: { role: "reader", type: "anyone" },
      });
    } catch (permError) {
      console.warn(
        "Could not set public read permission on scanned SI file:",
        permError,
      );
    }

    // 3. Store the link in column J of the invoice header row.
    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: `ServiceInvoices!J${siRowIdx + 2}`,
      valueInputOption: "USER_ENTERED",
      requestBody: { values: [[fileLink]] },
    });

    return NextResponse.json({
      success: true,
      fileId,
      fileLink,
      fileName,
    });
  } catch (error) {
    console.error("Scanned Service Invoice upload error:", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Failed to upload scanned Service Invoice.",
      },
      { status: 500 },
    );
  }
}