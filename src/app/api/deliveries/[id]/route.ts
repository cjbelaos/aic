import { NextResponse } from "next/server";
import { requireAuthenticatedSession } from "@/lib/auth/session";
import {
  updateDeliveryReceipt,
  deleteDeliveryReceipt,
  populateAndExportDeliveryReceiptFormPdf,
  UpdateDeliveryPayload,
} from "@/lib/deliverySheets";
import { getSheetsClient, getDatabaseSpreadsheetId } from "@/lib/googleSheets";
import { getCompanies } from "@/lib/companySheets";

const DELIVERY_RECEIPTS_SHEET = "DeliveryReceipts";
const DELIVERY_RECEIPT_ITEMS_SHEET = "DeliveryReceiptItems";

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await requireAuthenticatedSession();
  if (session instanceof Response) return session;

  try {
    const { id } = await params;
    const drNumber = parseInt(id, 10);
    if (isNaN(drNumber)) {
      return NextResponse.json({ error: "Invalid DR number." }, { status: 400 });
    }

    const sheets = await getSheetsClient();
    const spreadsheetId = await getDatabaseSpreadsheetId();

    // 1. Find DR header row
    const drRows = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: `${DELIVERY_RECEIPTS_SHEET}!A2:A`,
    });
    const rows = drRows.data.values || [];
    const drRowIdx = rows.findIndex((row) => {
      const val = parseInt(String(row[0] ?? "").trim(), 10);
      return val === drNumber;
    });
    if (drRowIdx < 0) {
      return NextResponse.json(
        { error: `DR #${drNumber} not found.` },
        { status: 404 },
      );
    }
    const drRowNumber = drRowIdx + 2; // +2: 0-based + header row

    const drResponse = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: `${DELIVERY_RECEIPTS_SHEET}!A${drRowNumber}:N${drRowNumber}`,
    });
    const drRow = drResponse.data.values?.[0] || [];
    const deliveryDate = String(drRow[1] ?? "").trim();
    const companyId = String(drRow[2] ?? "").trim();
    const poNo = String(drRow[3] ?? "").trim();
    const trNo = String(drRow[4] ?? "").trim();
    const comments = String(drRow[5] ?? "").trim();
    const preparedBy = String(drRow[6] ?? "").trim();
    const deliveredBy = String(drRow[7] ?? "").trim();
    const status = String(drRow[9] ?? "created").trim();

    // 2. Fetch DR items (active only)
    const itemsResponse = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: `${DELIVERY_RECEIPT_ITEMS_SHEET}!A2:E`,
    });
    const allItemRows = itemsResponse.data.values || [];
    const items = allItemRows
      .filter((row) => {
        const drId = parseInt(String(row[0] ?? "").trim(), 10);
        const itemStatus = String(row[4] ?? "active").trim();
        return drId === drNumber && itemStatus !== "deleted";
      })
      .map((row) => ({
        productCode: String(row[1] ?? "").trim(),
        quantity: parseInt(String(row[2] ?? "0"), 10) || 0,
        unit: String(row[3] ?? "").trim(),
        description: "",
      }));

    // 3. Fetch company details
    const companies = await getCompanies();
    const company = companies.find(
      (c) => c.companyId === companyId || c.id === companyId,
    );
    const companyName = company?.companyName || companyId;
    const address = company?.address || "";
    const tin = company?.tin || "";

    // 4. Generate PDF from DB data
    const { pdfBase64, printUrl } =
      await populateAndExportDeliveryReceiptFormPdf(drNumber);

    return NextResponse.json(
      {
        success: true,
        drNumber,
        companyName,
        address,
        tin,
        date: deliveryDate,
        poNo,
        trNo,
        preparedBy,
        deliveredBy,
        comments,
        items,
        status,
        printUrl,
        pdfBase64,
      },
      { status: 200 },
    );
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Failed to fetch delivery receipt preview.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await requireAuthenticatedSession();
  if (session instanceof Response) return session;

  try {
    const { id } = await params;
    const drNumber = parseInt(id, 10);
    if (isNaN(drNumber)) {
      return NextResponse.json({ error: "Invalid DR number." }, { status: 400 });
    }

    const body: UpdateDeliveryPayload = await request.json();
    const result = await updateDeliveryReceipt(drNumber, body, session.userId);
    return NextResponse.json(result, { status: 200 });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to update delivery receipt.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await requireAuthenticatedSession();
  if (session instanceof Response) return session;

  try {
    const { id } = await params;
    const drNumber = parseInt(id, 10);
    if (isNaN(drNumber)) {
      return NextResponse.json({ error: "Invalid DR number." }, { status: 400 });
    }

    await deleteDeliveryReceipt(drNumber);
    return NextResponse.json({ success: true }, { status: 200 });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to delete delivery receipt.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}