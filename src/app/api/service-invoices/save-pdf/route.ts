import { NextRequest, NextResponse } from "next/server";
import { Readable } from "stream";
import { getDriveUploadClient } from "@/lib/googleSheets";
import { populateAndExportServiceInvoiceFormPdf } from "@/lib/serviceInvoiceSheets";
import { requireAuthenticatedSession } from "@/lib/auth/session";

const SERVICE_INVOICE_DRIVE_FOLDER_ID = "166LGOl4qTL4Ukabnrk335OT0ccLQnCq_";

export async function POST(req: NextRequest) {
  try {
    const session = await requireAuthenticatedSession();
    if (session instanceof Response) return session;

    const body = (await req.json()) as {
      invoiceNo: string;
      companyName: string;
      date: string;
    };

    if (!body.invoiceNo || !body.companyName) {
      return NextResponse.json(
        { error: "invoiceNo and companyName are required." },
        { status: 400 },
      );
    }

    // Format month-year from date (MM-YYYY)
    let monthYear = "";
    if (body.date) {
      const d = new Date(
        body.date + (body.date.length === 10 ? "T00:00:00" : ""),
      );
      if (!isNaN(d.getTime())) {
        monthYear = `${String(d.getMonth() + 1).padStart(2, "0")}-${d.getFullYear()}`;
      }
    }

    // Sanitize company name for filename
    const safeName = body.companyName.replace(/[/\\?%*:|"<> ]+/g, "_");
    const fileName = `SI-${monthYear}-${body.invoiceNo}_${safeName}.pdf`;

    // Re-populate the ServiceInvoiceForm template from DB data, then export PDF
    const { pdfBase64 } = await populateAndExportServiceInvoiceFormPdf(
      body.invoiceNo,
    );
    const pdfBuffer = Buffer.from(pdfBase64, "base64");
    const pdfStream = Readable.from(pdfBuffer);

    // Upload to Drive (OAuth2 user client — service accounts have no storage quota)
    const drive = await getDriveUploadClient();

    // Check if file with same name already exists
    const existingRes = await drive.files.list({
      q: `'${SERVICE_INVOICE_DRIVE_FOLDER_ID}' in parents and name = '${fileName}' and trashed = false`,
      fields: "files(id, name)",
    });

    let fileId: string;
    if (existingRes.data.files && existingRes.data.files.length > 0) {
      fileId = existingRes.data.files[0].id!;
      await drive.files.update({
        fileId,
        media: { mimeType: "application/pdf", body: pdfStream },
      });
    } else {
      const uploadRes = await drive.files.create({
        requestBody: {
          name: fileName,
          parents: [SERVICE_INVOICE_DRIVE_FOLDER_ID],
        },
        media: { mimeType: "application/pdf", body: pdfStream },
      });
      fileId = uploadRes.data.id!;
    }

    const fileLink = `https://drive.google.com/file/d/${fileId}/view`;

    return NextResponse.json({
      success: true,
      fileId,
      fileLink,
      fileName,
      message: `Service Invoice saved to Google Drive as ${fileName}`,
    });
  } catch (error) {
    console.error("Save Service Invoice PDF to Drive error:", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Failed to save Service Invoice PDF to Google Drive",
      },
      { status: 500 },
    );
  }
}