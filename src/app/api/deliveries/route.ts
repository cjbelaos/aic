import { NextResponse } from "next/server";
import { Readable } from "stream";
import { requireAuthenticatedSession } from "@/lib/auth/session";
import {
  processDeliveryReceipt,
  getDeliveryReceipts,
  exportDeliveryReceiptFormPdf,
} from "@/lib/deliverySheets";
import { getDriveUploadClient, resolveDriveFolderPath, MONTH_NAMES, getDatabaseSpreadsheetId, getSheetsClient } from "@/lib/googleSheets";
import { CreateDeliveryPayload } from "@/types/deliveryReceipt";

const DR_PARENT_FOLDER_ID = "1AuGCBFxa-wp-SdfYXf_YTgY7wgtYHILo";

export async function GET() {
  const session = await requireAuthenticatedSession();
  if (session instanceof Response) return session;

  try {
    const receipts = await getDeliveryReceipts();
    return NextResponse.json(receipts, { status: 200 });
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Failed to fetch delivery receipts.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const session = await requireAuthenticatedSession();
  if (session instanceof Response) return session;

  try {
    const body: CreateDeliveryPayload = await request.json();

    if (!body.companyId?.trim()) {
      return NextResponse.json(
        { error: "Company is required." },
        { status: 400 },
      );
    }

    const isDraft = body.status === "draft";

    if (!isDraft) {
      if (!body.preparedBy?.trim()) {
        return NextResponse.json(
          { error: "Prepared by is required." },
          { status: 400 },
        );
      }
      if (!body.deliveredBy?.trim()) {
        return NextResponse.json(
          { error: "Delivered by is required." },
          { status: 400 },
        );
      }
      if (!body.items || body.items.length === 0) {
        return NextResponse.json(
          { error: "At least one product item is required." },
          { status: 400 },
        );
      }
    }

    const result = await processDeliveryReceipt(body, session.userId);

    // ── Auto-save PDF to Google Drive and store link (skip for drafts) ──
    let driveFileLink: string | undefined;
    if (!isDraft) {
      try {
      const { year, monthName, monthYear } = (() => {
        if (body.date) {
          const d = new Date(body.date + (body.date.length === 10 ? "T00:00:00" : ""));
          if (!isNaN(d.getTime())) {
            return {
              year: String(d.getFullYear()),
              monthName: MONTH_NAMES[d.getMonth()],
              monthYear: `${String(d.getMonth() + 1).padStart(2, "0")}-${d.getFullYear()}`,
            };
          }
        }
        return { year: "", monthName: "", monthYear: "" };
      })();

      const safeName = result.companyName.replace(/[/\\?%*:|"<> ]+/g, "_");
      const fileName = `DR-${monthYear}-${result.drNumber}_${safeName}.pdf`;

      const { pdfBase64 } = await exportDeliveryReceiptFormPdf();
      const pdfBuffer = Buffer.from(pdfBase64, "base64");
      const pdfStream = Readable.from(pdfBuffer);

      const drive = await getDriveUploadClient();
      const targetFolderId = year
        ? await resolveDriveFolderPath(drive, DR_PARENT_FOLDER_ID, year, monthName)
        : DR_PARENT_FOLDER_ID;

      const uploadRes = await drive.files.create({
        requestBody: { name: fileName, parents: [targetFolderId] },
        media: { mimeType: "application/pdf", body: pdfStream },
      });

      driveFileLink = `https://drive.google.com/file/d/${uploadRes.data.id}/view`;

      // Store the link in column K of the DR header row
      const sheets = await getSheetsClient();
      const spreadsheetId = await getDatabaseSpreadsheetId();
      const allRows = await sheets.spreadsheets.values.get({
        spreadsheetId,
        range: "DeliveryReceipts!A2:A",
      });
      const rows = allRows.data.values || [];
      const drRowIdx = rows.findIndex((row) => {
        const val = parseInt(String(row[0] ?? "").trim(), 10);
        return val === result.drNumber;
      });
      if (drRowIdx >= 0) {
        await sheets.spreadsheets.values.update({
          spreadsheetId,
          range: `DeliveryReceipts!K${drRowIdx + 2}`,
          valueInputOption: "USER_ENTERED",
          requestBody: { values: [[driveFileLink]] },
        });
      }
    } catch (e) {
      console.warn("Auto-save DR PDF to Drive failed (non-fatal):", e);
    }
    }

    return NextResponse.json(
      { ...result, driveFileLink },
      { status: 201 },
    );
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Failed to process delivery receipt.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
