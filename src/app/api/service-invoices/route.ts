import { NextResponse } from "next/server";
import { Readable } from "stream";
import { requireAuthenticatedSession } from "@/lib/auth/session";
import {
  processServiceInvoice,
  getServiceInvoices,
  exportServiceInvoiceFormPdf,
} from "@/lib/serviceInvoiceSheets";
import {
  getDriveUploadClient,
  getDatabaseSpreadsheetId,
  getSheetsClient,
} from "@/lib/googleSheets";
import { CreateServiceInvoicePayload } from "@/types/serviceInvoice";

const SERVICE_INVOICE_DRIVE_FOLDER_ID = "166LGOl4qTL4Ukabnrk335OT0ccLQnCq_";

export async function GET() {
  const session = await requireAuthenticatedSession();
  if (session instanceof Response) return session;

  try {
    const invoices = await getServiceInvoices();
    return NextResponse.json(invoices, { status: 200 });
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Failed to fetch service invoices.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const session = await requireAuthenticatedSession();
  if (session instanceof Response) return session;

  try {
    const body: CreateServiceInvoicePayload = await request.json();

    const isDraft = body.status === "draft";

    if (!isDraft) {
      if (!body.invoiceNo?.trim()) {
        return NextResponse.json(
          { error: "Invoice No. is required." },
          { status: 400 },
        );
      }
    }
    if (!body.customerId?.trim()) {
      return NextResponse.json(
        { error: "Customer is required." },
        { status: 400 },
      );
    }
    if (!body.date?.trim()) {
      return NextResponse.json({ error: "Date is required." }, { status: 400 });
    }

    if (!isDraft) {
      if (!body.preparedBy?.trim()) {
        return NextResponse.json(
          { error: "Prepared by is required." },
          { status: 400 },
        );
      }
      if (!body.items || body.items.length === 0) {
        return NextResponse.json(
          { error: "At least one item is required." },
          { status: 400 },
        );
      }
    }

    const result = await processServiceInvoice(body, session.userId);

    // ── Auto-save PDF to Google Drive and store link (skip for drafts) ──
    let driveFileLink: string | undefined;
    if (!isDraft) {
      try {
        const monthYear = (() => {
          if (body.date) {
            const d = new Date(
              body.date + (body.date.length === 10 ? "T00:00:00" : ""),
            );
            if (!isNaN(d.getTime())) {
              return `${String(d.getMonth() + 1).padStart(2, "0")}-${d.getFullYear()}`;
            }
          }
          return "";
        })();

        const safeName = result.companyName.replace(/[/\\?%*:|"<> ]+/g, "_");
        const fileName = `SI-${monthYear}-${result.invoiceNo}_${safeName}.pdf`;

        const { pdfBase64 } = await exportServiceInvoiceFormPdf();
        const pdfBuffer = Buffer.from(pdfBase64, "base64");
        const pdfStream = Readable.from(pdfBuffer);

        const drive = await getDriveUploadClient();
        const uploadRes = await drive.files.create({
          requestBody: {
            name: fileName,
            parents: [SERVICE_INVOICE_DRIVE_FOLDER_ID],
          },
          media: { mimeType: "application/pdf", body: pdfStream },
        });

        driveFileLink = `https://drive.google.com/file/d/${uploadRes.data.id}/view`;

        // Store the link in column J of the invoice header row
        const sheets = await getSheetsClient();
        const spreadsheetId = await getDatabaseSpreadsheetId();
        const allRows = await sheets.spreadsheets.values.get({
          spreadsheetId,
          range: "ServiceInvoices!A2:A",
        });
        const rows = allRows.data.values || [];
        const siRowIdx = rows.findIndex((row) => {
          return String(row[0] ?? "").trim() === result.invoiceNo;
        });
        if (siRowIdx >= 0) {
          await sheets.spreadsheets.values.update({
            spreadsheetId,
            range: `ServiceInvoices!J${siRowIdx + 2}`,
            valueInputOption: "USER_ENTERED",
            requestBody: { values: [[driveFileLink]] },
          });
        }
      } catch (e) {
        console.warn("Auto-save Service Invoice PDF to Drive failed (non-fatal):", e);
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
        : "Failed to process service invoice.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}