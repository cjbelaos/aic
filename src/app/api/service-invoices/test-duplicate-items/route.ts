import { NextResponse } from "next/server";
import { requireAuthenticatedSession } from "@/lib/auth/session";
import {
  exportServiceInvoiceFormPdf,
  testPopulateServiceInvoiceTemplateWithDuplicatedItems,
} from "@/lib/serviceInvoiceSheets";

/**
 * TEST ONLY: Populates the ServiceInvoiceForm print template with duplicated
 * item rows (fills all 19 rows) and exports the resulting PDF so the full
 * page layout can be reviewed/printed. Remove this route after testing.
 */
export async function POST(request: Request) {
  const session = await requireAuthenticatedSession();
  if (session instanceof Response) return session;

  try {
    const body = (await request.json()) as { invoiceNo?: string };
    const invoiceNo = String(body?.invoiceNo ?? "").trim();
    if (!invoiceNo) {
      return NextResponse.json(
        { error: "invoiceNo is required." },
        { status: 400 },
      );
    }

    await testPopulateServiceInvoiceTemplateWithDuplicatedItems(invoiceNo);

    // Export whatever is currently in the template (the duplicated 19-row layout).
    // PDF export is non-fatal — the user can still open the ServiceInvoiceForm tab.
    let pdfBase64 = "";
    let printUrl = "";
    try {
      const exported = await exportServiceInvoiceFormPdf();
      pdfBase64 = exported.pdfBase64;
      printUrl = exported.printUrl;
    } catch (e) {
      console.warn("Test: template populated but PDF export failed:", e);
    }

    return NextResponse.json(
      { success: true, invoiceNo, pdfBase64, printUrl },
      { status: 200 },
    );
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Failed to run service invoice duplicate-items test.";
    console.error("Service invoice duplicate-items test failed:", error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
