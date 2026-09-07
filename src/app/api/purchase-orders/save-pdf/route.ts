import { NextRequest, NextResponse } from "next/server";
import { Readable } from "stream";
import {
  getDriveUploadClient,
  resolveDriveFolderPath,
  MONTH_NAMES,
  escapeDriveQueryValue,
  getSheetsClient,
  getDatabaseSpreadsheetId,
} from "@/lib/googleSheets";
import { requireAuthenticatedSession } from "@/lib/auth/session";

const PO_PARENT_FOLDER_ID = "1AuGCBFxa-wp-SdfYXf_YTgY7wgtYHILo";

export async function POST(req: NextRequest) {
  try {
    const session = await requireAuthenticatedSession();
    if (session instanceof Response) return session;

    const body = (await req.json()) as {
      poNumber: number | string;
      supplierName: string;
      date: string;
      pdfBase64: string;
    };

    if (!body.pdfBase64 || !body.pdfBase64.trim()) {
      return NextResponse.json(
        { error: "pdfBase64 is required." },
        { status: 400 },
      );
    }

    if (!body.poNumber || !body.supplierName) {
      return NextResponse.json(
        { error: "poNumber and supplierName are required." },
        { status: 400 },
      );
    }

    // Derive year, month name, and month-year from date.
    let year = "";
    let monthName = "";
    let monthYear = "";
    if (body.date) {
      const d = new Date(
        body.date + (body.date.length === 10 ? "T00:00:00" : ""),
      );
      if (!isNaN(d.getTime())) {
        year = String(d.getFullYear());
        monthName = MONTH_NAMES[d.getMonth()];
        monthYear = `${String(d.getMonth() + 1).padStart(2, "0")}-${d.getFullYear()}`;
      }
    }

    // Sanitize supplier name for filename
    const safeName = body.supplierName.replace(/[/\\?%*:'|"<> ]+/g, "_");
    const fileName = `PO-${monthYear}-${body.poNumber}_${safeName}.pdf`;

    // PDF is generated client-side from the HTML form layout, then sent here as base64.
    const pdfBuffer = Buffer.from(body.pdfBase64, "base64");
    const pdfStream = Readable.from(pdfBuffer);

    // Upload to Drive
    const drive = await getDriveUploadClient();
    let targetFolderId = PO_PARENT_FOLDER_ID;
    if (year) {
      try {
        targetFolderId = await resolveDriveFolderPath(
          drive,
          PO_PARENT_FOLDER_ID,
          year,
          monthName,
        );
      } catch (folderErr) {
        console.warn(
          `Failed to resolve year/month folder (${year}/${monthName}); saving to parent folder.`,
          folderErr,
        );
      }
    }

    // Check if file with same name already exists in the target folder
    const existingRes = await drive.files.list({
      q: `'${targetFolderId}' in parents and name = '${escapeDriveQueryValue(fileName)}' and trashed = false`,
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

    // Persist the Drive link in column M of the PO header row
    try {
      const sheetsClient = await getSheetsClient();
      const spreadsheetId = await getDatabaseSpreadsheetId();
      const allRows = await sheetsClient.spreadsheets.values.get({
        spreadsheetId,
        range: "PurchaseOrders!A2:A",
      });
      const rows = allRows.data.values || [];
      const poRowIdx = rows.findIndex((row) => {
        const val = String(row[0] ?? "").trim();
        return val === String(body.poNumber).trim();
      });
      if (poRowIdx >= 0) {
        await sheetsClient.spreadsheets.values.update({
          spreadsheetId,
          range: `PurchaseOrders!M${poRowIdx + 2}`,
          valueInputOption: "USER_ENTERED",
          requestBody: { values: [[fileLink]] },
        });
      }
    } catch (linkErr) {
      console.warn("Failed to persist PO Drive link column (non-fatal):", linkErr);
    }

    return NextResponse.json({
      success: true,
      fileId,
      fileLink,
      fileName,
      message: `Purchase Order saved to Google Drive as ${fileName}`,
    });
  } catch (error) {
    console.error("Save PO PDF to Drive error:", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Failed to save PO PDF to Google Drive",
      },
      { status: 500 },
    );
  }
}
