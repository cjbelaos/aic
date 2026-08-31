import { NextResponse } from "next/server";
import { requireAuthenticatedSession } from "@/lib/auth/session";
import { getServiceInvoices } from "@/lib/serviceInvoiceSheets";
import { getSheetsClient, getDatabaseSpreadsheetId } from "@/lib/googleSheets";

/**
 * GET /api/reports/monthly-summary?year=2026&month=8
 * Returns monthly profit summary: SI revenue vs liquidation expenses.
 */
export async function GET(request: Request) {
  const session = await requireAuthenticatedSession();
  if (session instanceof Response) return session;

  try {
    const { searchParams } = new URL(request.url);
    const year = parseInt(searchParams.get("year") || "", 10);
    const month = parseInt(searchParams.get("month") || "", 10);

    if (!year || !month || month < 1 || month > 12) {
      return NextResponse.json(
        { error: "Valid year and month (1-12) are required." },
        { status: 400 },
      );
    }

    const startDate = `${year}-${String(month).padStart(2, "0")}-01`;
    const lastDay = new Date(year, month, 0).getDate();
    const endDate = `${year}-${String(month).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;

    // ── 1. Service Invoice Revenue ──
    const invoices = await getServiceInvoices();
    const monthInvoices = invoices.filter((inv) => {
      if (!inv.date || inv.status === "deleted" || inv.status === "draft") return false;
      return inv.date >= startDate && inv.date <= endDate;
    });

    let totalSIRevenue = 0;
    const siDetails = monthInvoices.map((inv) => {
      const total =
        inv.items?.reduce(
          (sum, i) => sum + (i.amount ?? (i.quantity || 0) * (i.unitPrice || 0)),
          0,
        ) || 0;
      totalSIRevenue += total;
      return {
        invoiceNo: inv.invoiceNo,
        date: inv.date,
        companyName: inv.companyName,
        total,
        drNumber: inv.drNumber,
        contractId: inv.contractId,
      };
    });
// ── 2. Liquidation Expenses ──
    let totalExpenses = 0;
    const liquidationDetails: Array<{
      liquidationId: string; controlNo: string; date: string; totalAmount: number;
    }> = [];

    try {
      const sheets = await getSheetsClient();
      const spreadsheetId = await getDatabaseSpreadsheetId();

      const liqResponse = await sheets.spreadsheets.values.get({
        spreadsheetId, range: "Liquidations!A2:K",
      });
      const liqRows = liqResponse.data.values || [];

      const receiptResponse = await sheets.spreadsheets.values.get({
        spreadsheetId, range: "ReceiptItems!A2:G",
      });
      const receiptRows = receiptResponse.data.values || [];

      const liqExpenses = new Map<string, { liquidationId: string; controlNo: string; total: number; date: string }>();

      for (const liqRow of liqRows) {
        const liquidationId = String(liqRow[0] ?? "").trim();
        if (!liquidationId) continue;
        const controlNo = String(liqRow[1] ?? "").trim();
        const status = String(liqRow[4] ?? "").trim().toUpperCase();
        if (status === "DELETED") continue;

        const liqReceipts = receiptRows.filter((r) => String(r[1] ?? "").trim() === liquidationId);
        const monthItems = liqReceipts.filter((r) => {
          const d = String(r[2] ?? "").trim();
          return d >= startDate && d <= endDate;
        });
        if (monthItems.length === 0) continue;

        const itemsTotal = monthItems.reduce((sum, r) => sum + (parseFloat(String(r[5] ?? "0")) || 0), 0);
        liqExpenses.set(liquidationId, {
          liquidationId, controlNo, total: itemsTotal,
          date: String(monthItems[0]?.[2] ?? "").trim(),
        });
      }

      // Add FTI detail expenses matching liquidation control numbers
      const ftiResponse = await sheets.spreadsheets.values.get({
        spreadsheetId, range: "FTIDetails!A2:I",
      });
      const ftiRows = ftiResponse.data.values || [];

      const ftiExpensesResponse = await sheets.spreadsheets.values.get({
        spreadsheetId, range: "FTIExpenses!A2:D",
      });
      const ftiExpRows = ftiExpensesResponse.data.values || [];

      for (const [, liqData] of liqExpenses) {
        if (!liqData.controlNo) continue;
        const matchingDetails = ftiRows.filter((r) => {
          const cn = String(r[1] ?? "").trim();
          const d = String(r[2] ?? "").trim();
          return cn === liqData.controlNo && d >= startDate && d <= endDate;
        });
        for (const detail of matchingDetails) {
          const detailId = String(detail[0] ?? "").trim();
          const fuelSubTotal = parseFloat(String(detail[7] ?? "0")) || 0;
          const tollFee = parseFloat(String(detail[8] ?? "0")) || 0;
          const miscExpenses = ftiExpRows
            .filter((r) => String(r[1] ?? "").trim() === detailId)
            .reduce((sum, r) => sum + (parseFloat(String(r[3] ?? "0")) || 0), 0);
          liqData.total += fuelSubTotal + tollFee + miscExpenses;
        }
      }

      for (const ld of liqExpenses.values()) {
        totalExpenses += ld.total;
        liquidationDetails.push({
          liquidationId: ld.liquidationId, controlNo: ld.controlNo,
          date: ld.date, totalAmount: ld.total,
        });
      }
    } catch (e) {
      console.warn("Failed to compute liquidation expenses:", e);
    }

    const netProfit = totalSIRevenue - totalExpenses;

    return NextResponse.json({
      period: { year, month, startDate, endDate },
      revenue: { total: totalSIRevenue, invoiceCount: monthInvoices.length, details: siDetails },
      expenses: { total: totalExpenses, liquidationCount: liquidationDetails.length, details: liquidationDetails },
      netProfit,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to generate monthly summary.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}