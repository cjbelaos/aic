import { NextRequest, NextResponse } from "next/server";
import { Readable } from "stream";
import { getDatabaseSpreadsheetId, getDriveUploadClient, getSheetsClient, resolveDriveFolderPath, MONTH_NAMES, escapeDriveQueryValue } from "@/lib/googleSheets";
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
      pdfBase64?: string;
    };

    if (!body.drNumber || !body.companyName) {
      return NextResponse.json(
        { error: "drNumber and companyName are required." },
        { status: 400 },
      );
    }

    // Resolve the stored file link before uploading, so renamed documents keep their file ID.
    const sheets = await getSheetsClient();
    const spreadsheetId = await getDatabaseSpreadsheetId();
    const receiptRows = await sheets.spreadsheets.values.get({ spreadsheetId, range: "DeliveryReceipts!A2:L" });
    const rowIndex = (receiptRows.data.values ?? []).findIndex(row => Number(row[0]) === Number(body.drNumber));
    if (rowIndex < 0) return NextResponse.json({ error: "Document not found." }, { status: 404 });
    const storedLink = String(receiptRows.data.values![rowIndex][11] ?? "");
    const storedFileId = storedLink.match(/\/d\/([a-zA-Z0-9_-]+)/)?.[1] ?? storedLink.match(/[?&]id=([a-zA-Z0-9_-]+)/)?.[1];

    // Derive year, month name, and month-year from delivery date.
    let year = "";
    let monthName = "";
    let monthYear = "";
    if (body.deliveryDate) {
      const d = new Date(body.deliveryDate + (body.deliveryDate.length === 10 ? "T00:00:00" : ""));
      if (!isNaN(d.getTime())) {
        year = String(d.getFullYear());
        monthName = MONTH_NAMES[d.getMonth()];
        monthYear = `${String(d.getMonth() + 1).padStart(2, "0")}-${d.getFullYear()}`;
      }
    }

    // Sanitize company name for filename
    const safeName = body.companyName.replace(/[/\\?%*:'|"<> ]+/g, "_");
    const fileName = `DR-${monthYear}-${body.drNumber}_${safeName}.pdf`;

    // Re-populate the DeliveryReceiptForm template from DB data, then export PDF
    const pdfBase64 = body.pdfBase64 ?? (await populateAndExportDeliveryReceiptFormPdf(body.drNumber)).pdfBase64;
    if (typeof pdfBase64 !== "string" || !pdfBase64.startsWith("JVBERi0") || pdfBase64.length > 28_000_000) {
      return NextResponse.json({ error: "A valid PDF under 20 MB is required." }, { status: 400 });
    }
    const pdfBuffer = Buffer.from(pdfBase64, "base64");
    const pdfStream = Readable.from(pdfBuffer);

    // Upload to Drive (must use OAuth2 user client — service accounts have no storage quota)
    const drive = await getDriveUploadClient();
    let targetFolderId = DR_PARENT_FOLDER_ID;
    if (year) {
      try {
        targetFolderId = await resolveDriveFolderPath(
          drive,
          DR_PARENT_FOLDER_ID,
          year,
          monthName,
        );
      } catch (folderErr) {
        // Non-fatal: fall back to the parent DR folder so the PDF still saves.
        console.warn(
          `Failed to resolve year/month folder (${year}/${monthName}); saving to parent folder.`,
          folderErr,
        );
      }
    }

    // Check if file with same name already exists in the target folder
    const existingRes = storedFileId ? { data: { files: [{ id: storedFileId }] } } : await drive.files.list({
      q: `'${targetFolderId}' in parents and name = '${escapeDriveQueryValue(fileName)}' and trashed = false`,
      fields: "files(id, name)",
    });

    let fileId: string;
    if (existingRes.data.files && existingRes.data.files.length > 0) {
      fileId = existingRes.data.files[0].id!;
      await drive.files.update({
        fileId,
        requestBody: { name: fileName },
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

    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: `DeliveryReceipts!L${rowIndex + 2}`,
      valueInputOption: "USER_ENTERED",
      requestBody: { values: [[fileLink]] },
    });

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
