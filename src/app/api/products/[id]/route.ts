import { NextResponse } from "next/server";
import { getSheetsClient } from "@/lib/googleSheets";

const SPREADSHEET_ID = process.env.GOOGLE_SHEET_ID;

interface RouteParams {
  params: Promise<{
    id: string;
  }>;
}

/**
 * PUT: Update an existing product row in the Google Sheet
 * Endpoint: /api/products/[row]
 */
export async function PUT(request: Request, { params }: RouteParams) {
  try {
    // Await the asynchronous params object
    const { id: rowNumber } = await params;
    const body = await request.json();

    if (!rowNumber) {
      return NextResponse.json(
        { error: "Missing product row identifier parameter" },
        { status: 400 },
      );
    }

    const sheets = await getSheetsClient();

    // Map fields cleanly to match your array column structure
    const updatedRow = [
      body.clientCode || "",
      body.productCode || "",
      body.productCategory || "",
      body.customerName || "",
      body.productName || "",
      body.description || "",
      body.unitName || "",
      body.costPerUnit || 0,
      body.pricePerUnit ?? "",
      body.supplierName || "",
      body.status || "In Stock",
      body.reOrderLevel ?? 0,
      body.begStock || 0,
      body.qtyIn || 0,
      body.quantityInStock || 0,
      body.reservedUnits || 0,
      body.qtyOut || 0,
      body.inventoryFlag || "",
    ];

    await sheets.spreadsheets.values.update({
      spreadsheetId: SPREADSHEET_ID,
      range: `Product List & Inventory!A${rowNumber}:R${rowNumber}`,
      valueInputOption: "USER_ENTERED",
      requestBody: { values: [updatedRow] },
    });

    // Return the updated object payload with a 200 status to match your frontend service's expectations
    return NextResponse.json({ id: rowNumber, ...body }, { status: 200 });
  } catch (error) {
    console.error(`[PRODUCT_PUT_ERROR] Failed updating row entry:`, error);
    return NextResponse.json(
      { error: "Internal Server Error during product update operation" },
      { status: 500 },
    );
  }
}

/**
 * DELETE: Remove or clear a product row from the Google Sheet
 * Endpoint: /api/products/[row]
 */
export async function DELETE(request: Request, { params }: RouteParams) {
  try {
    // Await the asynchronous params object
    const { id: rowNumber } = await params;

    if (!rowNumber) {
      return NextResponse.json(
        { error: "Missing product row identifier parameter" },
        { status: 400 },
      );
    }

    const sheets = await getSheetsClient();

    // Clear cells in the specified sheet range row to prevent alignment shifting
    await sheets.spreadsheets.values.clear({
      spreadsheetId: SPREADSHEET_ID,
      range: `Product List & Inventory!A${rowNumber}:R${rowNumber}`,
    });

    return NextResponse.json(
      { message: `Product entry row ${rowNumber} successfully cleared` },
      { status: 200 },
    );
  } catch (error) {
    console.error(`[PRODUCT_DELETE_ERROR] Failed purging row entry:`, error);
    return NextResponse.json(
      { error: "Internal Server Error during product deletion operation" },
      { status: 500 },
    );
  }
}
