import { NextRequest, NextResponse } from "next/server";
import { Readable } from "stream";
import { getDriveUploadClient } from "@/lib/googleSheets";
import { exportDeliveryReceiptFormPdf } from "@/lib/deliverySheets";
import { requireAuthenticatedSession } from "@/lib/auth/session";

const DR_DRIVE_FOLDER_ID = "1AkcAogFszjBJtB66ySXIszs3LvUQ_46d";

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

    // Re-fetch the PDF from the populated DeliveryReceiptForm
    const { pdfBase64 } = await exportDeliveryReceiptFormPdf();
    const pdfBuffer = Buffer.from(pdfBase64, "base64");
    const pdfStream = Readable.from(pdfBuffer);

    // Upload to Drive (must use OAuth2 user client — service accounts have no storage quota)
    const drive = await getDriveUploadClient();

    // Check if file with same name already exists
    const existingRes = await drive.files.list({
      q: `'${DR_DRIVE_FOLDER_ID}' in parents and name = '${fileName}' and trashed = false`,
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
        requestBody: { name: fileName, parents: [DR_DRIVE_FOLDER_ID] },
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