import { NextRequest, NextResponse } from "next/server";
import { Readable } from "stream";
import { getDriveUploadClient, resolveDriveFolderPath, MONTH_NAMES } from "@/lib/googleSheets";
import { populateAndExportDeliveryReceiptFormPdf } from "@/lib/deliverySheets";
import { requireAuthenticatedSession } from "@/lib/auth/session";

const DR_PARENT_FOLDER_ID = "1AuGCBFxa-wp-SdfYXf_YTgY7wgtYHILo";

export async function POST(req: NextRequest) {
  try {
    const session = await requireAuthenticatedSession();
    if (session instanceof Response) return session;

    const body = (await req.json()) as {
      drNumber: number;
      companyName: string;
      deliveryDate: string;
    };

    if (!body.drNumber || !body.companyName) {
      return NextResponse.json(
        { error: "drNumber and companyName are required." },
        { status: 400 },
      );
    }

    // Format month-year from delivery date (MM-YYYY)
    let monthYear = "";
    if (body.deliveryDate) {
      const d = new Date(body.deliveryDate + (body.deliveryDate.length === 10 ? "T00:00:00" : ""));
      if (!isNaN(d.getTime())) {
        monthYear = `${String(d.getMonth() + 1).padStart(2, "0")}-${d.getFullYear()}`;
      }
    }

    // Sanitize company name for filename
    const safeName = body.companyName.replace(/[/\\?%*:|"<> ]+/g, "_");
    const fileName = `DR-${monthYear}-${body.drNumber}_${safeName}.pdf`;

    // Re-populate the DeliveryReceiptForm template from DB data, then export PDF
    const { pdfBase64 } = await populateAndExportDeliveryReceiptFormPdf(body.drNumber);
    const pdfBuffer = Buffer.from(pdfBase64, "base64");
    const pdfStream = Readable.from(pdfBuffer);

    // Resolve year/month folder under the parent DR folder, creating if needed.
    let year = "";
    let monthName = "";
    if (body.deliveryDate) {
      const d = new Date(
        body.deliveryDate +
          (body.deliveryDate.length === 10 ? "T00:00:00" : ""),
      );
      if (!isNaN(d.getTime())) {
        year = String(d.getFullYear());
        monthName = MONTH_NAMES[d.getMonth()];
      }
    }

    // Upload to Drive (must use OAuth2 user client — service accounts have no storage quota)
    const drive = await getDriveUploadClient();
    const targetFolderId = year
      ? await resolveDriveFolderPath(drive, DR_PARENT_FOLDER_ID, year, monthName)
      : DR_PARENT_FOLDER_ID;

    // Check if file with same name already exists in the target folder
    const existingRes = await drive.files.list({
      q: `'${targetFolderId}' in parents and name = '${fileName}' and trashed = false`,
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
        requestBody: { name: fileName, parents: [targetFolderId] },
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
      message: `Delivery Receipt saved to Google Drive as ${fileName}`,
    });
  } catch (error) {
    console.error("Save DR PDF to Drive error:", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Failed to save DR PDF to Google Drive",
      },
      { status: 500 },
    );
  }
}