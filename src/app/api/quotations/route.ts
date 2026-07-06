import { NextResponse } from "next/server";
import { google } from "googleapis";

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const {
      clientName,
      address,
      contactPerson,
      emailAddress,
      quotationDescription, // "PORTABLE RO Parts"
      items, // Array of row objects: { description, notation, qty, unit, priceUnit }
      terms,
      delivery,
      warranty,
      preparedBy,
      approvedBy,
    } = body;

    // 1. Calculate Date Metrics
    const today = new Date();

    // Serial float conversion matching the requested reference format (Days since 1899-12-30)
    const floatQuotationNo = today.getTime() / 86400000 + 25569;

    const validityDate = new Date();
    validityDate.setDate(today.getDate() + 90);

    const formattedDate = today.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
    const formattedValidity = validityDate.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });

    // 2. Initialize Google Auth Engine
    const auth = new google.auth.JWT({
      email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
      key: (process.env.GOOGLE_PRIVATE_KEY || "").replace(/\\n/g, "\n"),
      scopes: ["https://www.googleapis.com/auth/spreadsheets"],
    });

    const sheets = google.sheets({ version: "v4", auth });

    // 3. Process calculations for the spreadsheet logs
    let subTotal = 0;
    items.forEach((item: any) => {
      subTotal += Number(item.qty || 0) * Number(item.priceUnit || 0);
    });

    const grandTotal = subTotal; // Assuming discount handling can be dynamic later
    const vatAmount = grandTotal * (12 / 112);
    const vatableAmount = grandTotal - vatAmount;

    // 4. Structure the payload row to save into your "Quotations" spreadsheet tab
    const mainLogEntry = [
      formattedDate,
      floatQuotationNo.toFixed(5),
      formattedValidity,
      clientName,
      address,
      contactPerson,
      emailAddress,
      quotationDescription,
      subTotal.toFixed(2),
      grandTotal.toFixed(2),
      vatAmount.toFixed(2),
      vatableAmount.toFixed(2),
      terms,
      delivery,
      warranty,
      preparedBy,
      approvedBy,
    ];

    await sheets.spreadsheets.values.append({
      spreadsheetId: process.env.GOOGLE_SHEET_ID,
      range: "Quotations!A:Q", // Appends rows automatically to a tab named "Quotations"
      valueInputOption: "USER_ENTERED",
      requestBody: {
        values: [mainLogEntry],
      },
    });

    return NextResponse.json({
      success: true,
      quotationNo: floatQuotationNo.toFixed(5),
      date: formattedDate,
      validity: formattedValidity,
      totals: { subTotal, grandTotal, vatAmount, vatableAmount },
    });
  } catch (error: any) {
    console.error("Spreadsheet Transaction Failure:", error);
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 },
    );
  }
}
