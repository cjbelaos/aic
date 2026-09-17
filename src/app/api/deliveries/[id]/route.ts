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
import { getProducts } from "@/lib/productSheets";
import { getDeliveryItems } from "@/lib/transactionItemSheets";

const DELIVERY_RECEIPTS_SHEET = "DeliveryReceipts";

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
      range: `${DELIVERY_RECEIPTS_SHEET}!A${drRowNumber}:O${drRowNumber}`,
    });
    const drRow = drResponse.data.values?.[0] || [];
    const deliveryDate = String(drRow[1] ?? "").trim();
    const companyId = String(drRow[2] ?? "").trim();
    const poNo = String(drRow[3] ?? "").trim();
    const trNo = String(drRow[4] ?? "").trim();
    const comments = String(drRow[6] ?? "").trim();
    const preparedBy = String(drRow[7] ?? "").trim();
    const deliveredBy = String(drRow[8] ?? "").trim();
    const status = String(drRow[10] ?? "created").trim();

    // 2. Fetch DR items from the canonical DeliveryReceiptItems tab
    const itemsByDr = await getDeliveryItems();
    const currentItems = itemsByDr.get(drNumber) ?? [];
    const products = await getProducts();
    const productMap = new Map(products.map((product) => [product.productCode, product]));
    const items = currentItems.map((item) => ({
      ...item,
      description:
        item.description ||
        productMap.get(item.productCode)?.productName ||
        item.productCode,
    }));

    // 3. Fetch company details
    const companies = await getCompanies();
    const company = companies.find(
      (c) => c.companyId === companyId || c.id === companyId,
    );
    const companyName = company?.companyName || companyId;
    const address = company?.address || "";
    const tin = company?.tin || "";

    // Current receipts use the in-app A4 document. Do not make their preview
    // depend on regenerating the retired Google Sheets PDF template.
    let pdfBase64: string | undefined;
    let printUrl: string | undefined;
    if (!currentItems) {
      ({ pdfBase64, printUrl } =
        await populateAndExportDeliveryReceiptFormPdf(drNumber));
    }

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
        driveFileLink: String(drRow[11] ?? "").trim() || undefined,
        previewFormat: currentItems ? "current" : "legacy",
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
