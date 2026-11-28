import { recordServiceInvoiceScan } from "@/lib/serviceInvoiceSheets";
import { trackerWarningAfterScan } from "@/lib/documentHandoverSheets";
import { NextRequest, NextResponse } from "next/server";
import { markReplacedScan, noDateWarning, scanCustomerName } from "@/lib/scannedCopyDrive";
import { scanExtension, scannedCopyFileName } from "@/lib/scannedCopyFileName";
import { Readable } from "stream";
import { requireAuthenticatedSession } from "@/lib/auth/session";
import {
  getDriveUploadClient,
  getDatabaseSpreadsheetId,
  getSheetsClient,
} from "@/lib/googleSheets";

const SERVICE_INVOICE_DRIVE_FOLDER_ID = "1bUpm-7ExZzgBvcmqBNd24iw6n3q_R1IM";
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
  if (!["application/pdf", "image/jpeg", "image/png", "image/webp"].includes(file.type)) return NextResponse.json({ error: "Upload a PDF, JPEG, PNG or WebP scan." }, { status: 400 });
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

    // The file is named from the invoice: B = Date, C = customer, J = legacy link, T = metadata.
    const rowNumber = siRowIdx + 2;
    const rowResponse = await sheets.spreadsheets.values.get({ spreadsheetId, range: `${SERVICE_INVOICES_SHEET}!A${rowNumber}:T${rowNumber}` });
    const invoiceRow = rowResponse.data.values?.[0] ?? [];
    const customerName = await scanCustomerName(String(invoiceRow[2] ?? "").trim());
    let previousScan: string | undefined;
    try {
      previousScan = String(JSON.parse(String(invoiceRow[19] || "{}")).scannedFileLink || "") || undefined;
    } catch {
      previousScan = undefined;
    }
    const legacyLink = String(invoiceRow[9] ?? "").trim() || undefined;
    const { name: fileName, usedToday } = scannedCopyFileName({
      prefix: "SR",
      date: String(invoiceRow[1] ?? ""),
      number: invoiceNo,
      customer: customerName,
      extension: scanExtension(file.name, file.type),
    });

    // 2. Upload the scanned file to Drive.
    const buffer = Buffer.from(await file.arrayBuffer());

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

    await recordServiceInvoiceScan(invoiceNo, fileLink, session.userId);

    // Follow-up steps never undo the saved scan; they come back as warnings.
    const warnings: string[] = [];
    if (usedToday) warnings.push(noDateWarning("Service Invoice"));
    // Older scans are known only by the SI-SCANNED_ name on the J link; J may also be a generated PDF.
    const replaceWarning = previousScan
      ? await markReplacedScan(drive, previousScan)
      : await markReplacedScan(drive, legacyLink, { onlyIfNamePrefix: "SI-SCANNED_" });
    if (replaceWarning) warnings.push(replaceWarning);

    // The signed copy is back: receive and verify it in the Document Tracker.
    const trackerWarning = await trackerWarningAfterScan({
      documentType: "service_invoice",
      documentNumber: invoiceNo,
      actor: session,
      resolveCustomerName: async () => customerName,
    });

    return NextResponse.json({
      success: true,
      fileId,
      fileLink,
      fileName,
      trackerWarning,
      statusWarning: warnings.join(" ") || undefined,
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