import { NextResponse } from "next/server";
import { requireAuthenticatedSession } from "@/lib/auth/session";
import { getSheetsClient, getDatabaseSpreadsheetId } from "@/lib/googleSheets";

const PRODUCTS_SHEET = "Products";

interface RouteParams {
  params: Promise<{
    id: string;
  }>;
}

/**
 * Helper: Extracts the numeric row number from a product ID string.
 * Example: "prod_5" -> 5
 */
function getRowNumber(id: string): number {
  const rowStr = id.replace("prod_", "");
  const rowNum = parseInt(rowStr, 10);
  if (isNaN(rowNum)) {
    throw new Error(`Invalid product ID format: ${id}`);
  }
  return rowNum;
}

/**
 * PUT: Update an existing product row in the Products sheet.
 * Endpoint: /api/products/[id]
 */
export async function PUT(request: Request, { params }: RouteParams) {
  const session = await requireAuthenticatedSession();
  if (session instanceof Response) return session;

  try {
    const { id } = await params;
    const rowNumber = getRowNumber(id);

    if (!rowNumber) {
      return NextResponse.json(
        { error: "Missing product row identifier parameter" },
        { status: 400 },
      );
    }

    const sheets = await getSheetsClient();
    const spreadsheetId = await getDatabaseSpreadsheetId();

    const body = await request.json();

    // Map fields to match the 8-column layout defined in productSheets.ts:
    // A=ProductCode, B=ProductName, C=ProductCategoryCode,
    // D=ProductDescription, E=UnitCode, F=Cost/Unit, G=Price/Unit, H=SupplierId
    const updatedRow = [
      body.code || "",
      body.name || "",
      body.category?.code || body.category?.name || "",
      body.description || "",
      body.unit?.code || body.unit?.name || "",
      body.costPerUnit || 0,
      body.pricePerUnit ?? "",
      body.supplier?.supplierId || body.supplier?.id || "",
    ];

    const updateRange = `${PRODUCTS_SHEET}!A${rowNumber}:H${rowNumber}`;

    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: updateRange,
      valueInputOption: "USER_ENTERED",
      requestBody: { values: [updatedRow] },
    });

    return NextResponse.json(
      { message: `Product row ${rowNumber} updated successfully` },
      { status: 200 },
    );
  } catch (error) {
    console.error(`[PRODUCT_PUT_ERROR] Failed updating row entry:`, error);
    const message =
      error instanceof Error ? error.message : "Internal Server Error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/**
 * DELETE: Clear a product row from the Products sheet.
 * Endpoint: /api/products/[id]
 */
export async function DELETE(request: Request, { params }: RouteParams) {
  const session = await requireAuthenticatedSession();
  if (session instanceof Response) return session;

  try {
    const { id } = await params;
    const rowNumber = getRowNumber(id);

    if (!rowNumber) {
      return NextResponse.json(
        { error: "Missing product row identifier parameter" },
        { status: 400 },
      );
    }

    const sheets = await getSheetsClient();
    const spreadsheetId = await getDatabaseSpreadsheetId();

    // Clear cells in the specified row (8 columns: A-H)
    const deleteRange = `${PRODUCTS_SHEET}!A${rowNumber}:H${rowNumber}`;

    await sheets.spreadsheets.values.clear({
      spreadsheetId,
      range: deleteRange,
    });

    return NextResponse.json(
      { message: `Product row ${rowNumber} successfully cleared` },
      { status: 200 },
    );
  } catch (error) {
    console.error(`[PRODUCT_DELETE_ERROR] Failed purging row entry:`, error);
    const message =
      error instanceof Error ? error.message : "Internal Server Error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}