import { NextResponse } from "next/server";
import {
  getSheetsClient,
  getDatabaseSpreadsheetId,
  getAccessTokenForFetch,
} from "@/lib/googleSheets";

/**
 * DEV-ONLY simulation of the PurchaseOrderForm print template.
 *
 * Writes mock data into the exact cells used by the real PO PDF pipeline
 * (see populateAndExportPurchaseOrderFormPdf in src/lib/purchaseOrderSheets.ts)
 * and exports the sheet to PDF via Google's export endpoint.
 *
 *   Cell    Content          Mock value
 *   H6      Date             "09/07/2026"
 *   H7      PO #             "AIC-VTALTE-MOCK01"
 *   A9      Supplier Name    ...
 *   A10     Supplier Address ...
 *   A11     Supplier TIN     ...
 *   A15:A52 Item #           per item
 *   B15:D52 Description     per item
 *   E15:E52 Qty              per item
 *   F15:F52 Unit             per item
 *   G15:G52 Unit Price       per item
 *   H15:H52 Total Price      qty x unit price
 *   H53     Subtotal Amount  sum of totals
 *   B55:D57 Comments         ...
 *   C60     Prepared By      ...
 *   G60     Approved By      ...
 *   C63     Noted By         ...
 *
 * GET  http://localhost:3000/api/dev/simulate-purchase-order-form
 *   -> downloads purchase-order-form-mock.pdf
 */

const PRINT_TEMPLATE_SHEET = "PurchaseOrderForm";

const MOCK_SUPPLIER = {
  name: "ACME Steel Trading Corporation",
  address: "123 Industrial Avenue, Brgy. San Roque, Quezon City, Metro Manila",
  tin: "000-123-456-789",
};

const MOCK_ITEMS: Array<{
  itemNo: number;
  description: string;
  qty: number;
  unit: string;
  price: number;
}> = [
  {
    itemNo: 1,
    description: "Steel Rebar 10mm (Grade 40) — cut to 3m lengths",
    qty: 48,
    unit: "pcs",
    price: 185.5,
  },
  {
    itemNo: 2,
    description: "Portland Cement Type 1P — 40kg bag",
    qty: 25,
    unit: "bag",
    price: 286.0,
  },
  {
    itemNo: 3,
    description: 'Marine Plywood 1/2" 4x8 ft (B/BB)',
    qty: 12,
    unit: "sheet",
    price: 1240.0,
  },
  {
    itemNo: 4,
    description: 'GI Pipe 1" dia Schedule 40 (3m length)',
    qty: 30,
    unit: "len",
    price: 789.75,
  },
  {
    itemNo: 5,
    description: 'PVC Conduit 3/4" — 3m length',
    qty: 60,
    unit: "len",
    price: 42.5,
  },
];

async function getSheetTabGid(
  sheets: Awaited<ReturnType<typeof getSheetsClient>>,
  spreadsheetId: string,
  sheetName: string,
): Promise<number> {
  const meta = await sheets.spreadsheets.get({
    spreadsheetId,
    ranges: [sheetName],
    fields: "sheets.properties(sheetId,title)",
  });
  const sheet = meta.data.sheets?.find(
    (s) => s.properties?.title === sheetName,
  );
  if (!sheet?.properties?.sheetId)
    throw new Error(`Sheet "${sheetName}" not found.`);
  return sheet.properties.sheetId;
}

function buildExportUrl(spreadsheetId: string, gid: number): string {
  return `https://docs.google.com/spreadsheets/d/${spreadsheetId}/export?format=pdf&portrait=true&size=a4&gridlines=false&gid=${gid}`;
}

async function fetchExportPdfBase64(printUrl: string): Promise<string> {
  const token = await getAccessTokenForFetch();
  const res = await fetch(printUrl, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(`Failed to export PDF (HTTP ${res.status}).`);
  const buf = await res.arrayBuffer();
  return Buffer.from(buf).toString("base64");
}
export async function GET() {
  if (process.env.NODE_ENV !== "development") {
    return NextResponse.json(
      { error: "Simulation endpoint is available in development only." },
      { status: 404 },
    );
  }

  try {
    const sheets = await getSheetsClient();
    const spreadsheetId = await getDatabaseSpreadsheetId();

    // Clear previous items rows (matches production template write)
    await sheets.spreadsheets.values.clear({
      spreadsheetId,
      range: `${PRINT_TEMPLATE_SHEET}!A15:H52`,
    });

    const subtotal = MOCK_ITEMS.reduce(
      (sum, item) => sum + item.qty * item.price,
      0,
    );

    const batchData: Array<{ range: string; values: any[][] }> = [
      { range: `${PRINT_TEMPLATE_SHEET}!H6`, values: [["09/07/2026"]] },
      { range: `${PRINT_TEMPLATE_SHEET}!H7`, values: [["AIC-VTALTE-MOCK01"]] },
      { range: `${PRINT_TEMPLATE_SHEET}!A9`, values: [[MOCK_SUPPLIER.name]] },
      {
        range: `${PRINT_TEMPLATE_SHEET}!A10`,
        values: [[MOCK_SUPPLIER.address]],
      },
      { range: `${PRINT_TEMPLATE_SHEET}!A11`, values: [[MOCK_SUPPLIER.tin]] },
    ];

    MOCK_ITEMS.forEach((item, idx) => {
      const rowNum = 15 + idx;
      if (rowNum <= 52) {
        const total = Math.round(item.qty * item.price * 100) / 100;
        batchData.push(
          { range: `${PRINT_TEMPLATE_SHEET}!A${rowNum}`, values: [[item.itemNo]] },
          {
            range: `${PRINT_TEMPLATE_SHEET}!B${rowNum}:D${rowNum}`,
            values: [[item.description]],
          },
          { range: `${PRINT_TEMPLATE_SHEET}!E${rowNum}`, values: [[item.qty]] },
          { range: `${PRINT_TEMPLATE_SHEET}!F${rowNum}`, values: [[item.unit]] },
          { range: `${PRINT_TEMPLATE_SHEET}!G${rowNum}`, values: [[item.price]] },
          { range: `${PRINT_TEMPLATE_SHEET}!H${rowNum}`, values: [[total]] },
        );
      }
    });

    batchData.push(
      { range: `${PRINT_TEMPLATE_SHEET}!H53`, values: [[subtotal]] },
      {
        range: `${PRINT_TEMPLATE_SHEET}!B55:D57`,
        values: [["Deliver to Warehouse B before 10:00 AM. Include delivery receipt and material certificates."]],
      },
      { range: `${PRINT_TEMPLATE_SHEET}!C60`, values: [["Juan Dela Cruz"]] },
      { range: `${PRINT_TEMPLATE_SHEET}!G60`, values: [["Maria Santos"]] },
      { range: `${PRINT_TEMPLATE_SHEET}!C63`, values: [["Gen. Manager"]] },
    );

    await sheets.spreadsheets.values.batchUpdate({
      spreadsheetId,
      requestBody: {
        valueInputOption: "USER_ENTERED",
        data: batchData,
      },
    });

    const gid = await getSheetTabGid(sheets, spreadsheetId, PRINT_TEMPLATE_SHEET);
    const printUrl = buildExportUrl(spreadsheetId, gid);
    const pdfBase64 = await fetchExportPdfBase64(printUrl);

    return new NextResponse(new Uint8Array(Buffer.from(pdfBase64, "base64")), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition":
          'attachment; filename="purchase-order-form-mock.pdf"',
      },
    });
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Failed to simulate the purchase order form PDF.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}