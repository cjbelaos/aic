import { NextRequest, NextResponse } from "next/server";
import { requireAdminSession } from "@/lib/auth/session";
import { getUsers } from "@/lib/userSheets";
import { getDepartments } from "@/lib/departmentSheets";
import { getServiceInvoices } from "@/lib/serviceInvoiceSheets";
import { getDeliveryReceipts } from "@/lib/deliverySheets";
import { getAllFTIRequests } from "@/lib/ftiSheets";
import { getSheetsClient, getDatabaseSpreadsheetId } from "@/lib/googleSheets";
import type {
  TechnicianEarningRow,
  TechnicianEarningsResponse,
  TechnicianMonthlySeries,
} from "@/types/technicianEarnings";

/**
 * GET /api/reports/technician-earnings?year=2026[&month=9]
 * Monthly or yearly earnings vs expenses for technicians (users with departmentId === 1).
 *
 * Earnings (Service Invoices / SR):
 * - An SI is credited to the technician resolved by (1) the SI's own
 *   deliveredById, else (2) the linked DR's deliveredById (internal only).
 * - "SR with DR" = the SI has a linked DR. "SR without DR" = the SI has no DR
 *   but carries its own deliveredById.
 * - SIs with no deliveredById and no DR are excluded entirely (per D-006).
 *
 * When `month` is omitted the response covers the full year and the `monthly`
 * array holds 12 aggregated buckets for analytics charts.
 * Expenses: liquidation receipt items dated in the period + FTI detail expenses
 * (fuel/toll/misc) for the technician's liquidation control numbers. The FTI
 * requested totals are returned separately as reference to avoid double counting.
 */

function monthIndexFromDate(d: string): number {
  const m = parseInt(String(d).slice(5, 7), 10);
  return Number.isNaN(m) || m < 1 ? 0 : Math.min(m, 12) - 1;
}

export async function GET(req: NextRequest) {
  const session = await requireAdminSession();
  if (session instanceof Response) return session;

  try {
    const { searchParams } = new URL(req.url);
    const year = parseInt(searchParams.get("year") || "", 10);
    const monthRaw = parseInt(searchParams.get("month") || "", 10);
    const month = monthRaw >= 1 && monthRaw <= 12 ? monthRaw : null;
    const userId = (searchParams.get("userId") || "").trim();
    if (!year) {
      return NextResponse.json(
        { error: "Valid year is required." },
        { status: 400 },
      );
    }

    const yearStart = `${year}-01-01`;
    const yearEnd = `${year}-12-31`;
    const startDate = month
      ? `${year}-${String(month).padStart(2, "0")}-01`
      : yearStart;
    const lastDay = month ? new Date(year, month, 0).getDate() : 31;
    const endDate = month
      ? `${year}-${String(month).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`
      : yearEnd;
    const inWindow = (d: string) => !!d && d >= startDate && d <= endDate;

    // ── Technicians: users in department 1 ──
    const deptId = 1;
    const departments = await getDepartments();
    const deptName =
      departments.find((d) => d.departmentId === deptId)?.departmentName ??
      `Department ${deptId}`;
    const users = await getUsers();
    const techUsers = users
      .filter((u) => u.departmentId === deptId && (!userId || u.userId === userId))
      .sort((a, b) => (a.fullName || "").localeCompare(b.fullName || ""));

    const rows: TechnicianEarningRow[] = techUsers.map((u) => ({
      userId: u.userId,
      fullName: u.fullName || u.userId,
      srWithDrTotal: 0,
      srWithDrCount: 0,
      srWithoutDrTotal: 0,
      srWithoutDrCount: 0,
      srTotal: 0,
      ftiTotal: 0,
      ftiCount: 0,
      liquidationTotal: 0,
      liquidationCount: 0,
      net: 0,
      details: [],
    }));
    const byUser = new Map(rows.map((r) => [r.userId, r]));

    let noDelivererCount = 0;
    let noDelivererTotal = 0;
    let outsideDeptCount = 0;
    let outsideDeptTotal = 0;

    const monthly: TechnicianMonthlySeries[] = Array.from(
      { length: 12 },
      (_, i) => ({
        month: i + 1,
        srWithDr: 0,
        srWithDrCount: 0,
        srWithoutDr: 0,
        srWithoutDrCount: 0,
        srTotal: 0,
        fti: 0,
        ftiCount: 0,
        liquidation: 0,
        liquidationCount: 0,
        net: 0,
      }),
    );
    const stepMonthly = (
      d: string,
      upstream: (m: TechnicianMonthlySeries) => void,
    ) => {
      const bucket = monthly[monthIndexFromDate(d)];
      if (bucket) upstream(bucket);
    };

    // ── 1. SR earnings (Service Invoices) ──
    const drs = await getDeliveryReceipts();
    const drMap = new Map<string, (typeof drs)[number]>();
    for (const dr of drs) drMap.set(String(dr.drNumber), dr);

    const invoices = await getServiceInvoices();
    const yearInvoices = invoices.filter((inv) => {
      if (
        !inv.date ||
        inv.status === "deleted" ||
        inv.status === "draft" ||
        inv.status === "cancelled" ||
        inv.date < yearStart ||
        inv.date > yearEnd
      )
        return false;
      return true;
    });

    for (const inv of yearInvoices) {
      const total =
        inv.items?.reduce(
          (sum, i) => sum + (i.amount ?? (i.quantity || 0) * (i.unitPrice || 0)),
          0,
        ) || 0;
      const hasDr = inv.drNumber != null && inv.drNumber > 0;

      let delivererId = "";
      if (inv.deliveredById && inv.deliveredById.trim()) {
        delivererId = inv.deliveredById.trim();
      } else if (hasDr) {
        const dr = drMap.get(String(inv.drNumber));
        if (dr && dr.deliveredById && dr.deliveredByType !== "external") {
          delivererId = dr.deliveredById;
        }
      }

      if (!delivererId) {
        if (inWindow(inv.date)) {
          noDelivererCount++;
          noDelivererTotal += total;
        }
        continue;
      }

      const row = byUser.get(delivererId);
      if (!row) {
        if (inWindow(inv.date)) {
          outsideDeptCount++;
          outsideDeptTotal += total;
        }
        continue;
      }

      stepMonthly(inv.date, (m) => {
        if (hasDr) {
          m.srWithDr += total;
          m.srWithDrCount++;
        } else {
          m.srWithoutDr += total;
          m.srWithoutDrCount++;
        }
      });

      if (!inWindow(inv.date)) continue;
      if (hasDr) {
        row.srWithDrTotal += total;
        row.srWithDrCount++;
        row.details.push({
          kind: "sr_with_dr",
          refNo: inv.invoiceNo,
          date: inv.date,
          companyName: inv.companyName,
          drNumber: inv.drNumber,
          amount: total,
        });
      } else {
        row.srWithoutDrTotal += total;
        row.srWithoutDrCount++;
        row.details.push({
          kind: "sr_without_dr",
          refNo: inv.invoiceNo,
          date: inv.date,
          companyName: inv.companyName,
          amount: total,
        });
      }
    }

// ── 2. FTI requested totals (reference) ──
    const ftiRequests = await getAllFTIRequests();
    for (const req of ftiRequests) {
      const row = byUser.get(req.userId);
      if (!row) continue;
      const d = req.dateCreated || "";
      if (d < yearStart || d > yearEnd) continue;
      if (!req.status || req.status.trim().toUpperCase() === "DRAFT") continue;
      const amount = req.totalAmount || 0;
      if (amount <= 0) continue;
      stepMonthly(d, (m) => {
        m.fti += amount;
        m.ftiCount++;
      });
      if (!inWindow(d)) continue;
      row.ftiTotal += amount;
      row.ftiCount++;
      row.details.push({ kind: "fti", refNo: req.controlNo, date: d, amount });
    }

    // ── 3. Liquidation expenses (mirrors /api/reports/monthly-summary) ──
    try {
      const sheets = await getSheetsClient();
      const spreadsheetId = await getDatabaseSpreadsheetId();

      const liqResponse = await sheets.spreadsheets.values.get({
        spreadsheetId,
        range: "Liquidations!A2:K",
      });
      const liqRows = liqResponse.data.values || [];

      const receiptResponse = await sheets.spreadsheets.values.get({
        spreadsheetId,
        range: "ReceiptItems!A2:G",
      });
      const receiptRows = receiptResponse.data.values || [];

      const ftiResponse = await sheets.spreadsheets.values.get({
        spreadsheetId,
        range: "FTIDetails!A2:I",
      });
      const ftiRows = ftiResponse.data.values || [];

      const ftiExpensesResponse = await sheets.spreadsheets.values.get({
        spreadsheetId,
        range: "FTIExpenses!A2:D",
      });
      const ftiExpRows = ftiExpensesResponse.data.values || [];

      const liqMeta = new Map<string, { userId: string; controlNo: string }>();
      const validControlNos = new Set<string>();
      for (const liqRow of liqRows) {
        const liquidationId = String(liqRow[0] ?? "").trim();
        if (!liquidationId) continue;
        const status = String(liqRow[4] ?? "").trim().toUpperCase();
        if (status === "DELETED") continue;
        const meta = {
          userId: String(liqRow[2] ?? "").trim(),
          controlNo: String(liqRow[1] ?? "").trim(),
        };
        liqMeta.set(liquidationId, meta);
        if (meta.controlNo) validControlNos.add(meta.controlNo);
      }

      // Receipt items, bucketed by the receipt item's own date
      const countedLiq = new Map<string, Set<string>>();
      for (const r of receiptRows) {
        const meta = liqMeta.get(String(r[1] ?? "").trim());
        if (!meta) continue;
        const row = byUser.get(meta.userId);
        if (!row) continue;
        const d = String(r[2] ?? "").trim();
        if (d < yearStart || d > yearEnd) continue;
        const amount = parseFloat(String(r[5] ?? "0")) || 0;
        stepMonthly(d, (m) => {
          m.liquidation += amount;
          m.liquidationCount++;
        });
        if (!inWindow(d)) continue;
        row.liquidationTotal += amount;
        const set = countedLiq.get(row.userId) || new Set<string>();
        set.add(String(r[1] ?? "").trim());
        countedLiq.set(row.userId, set);
      }

      // FTI detail expenses (fuel/toll/misc) for liquidatable control numbers
      for (const detail of ftiRows) {
        const controlNo = String(detail[1] ?? "").trim();
        if (!controlNo || !validControlNos.has(controlNo)) continue;
        const d = String(detail[2] ?? "").trim();
        if (d < yearStart || d > yearEnd) continue;
        const detailId = String(detail[0] ?? "").trim();
        const fuelSubTotal = parseFloat(String(detail[7] ?? "0")) || 0;
        const tollFee = parseFloat(String(detail[8] ?? "0")) || 0;
        const misc = ftiExpRows
          .filter((r) => String(r[1] ?? "").trim() === detailId)
          .reduce((sum, r) => sum + (parseFloat(String(r[3] ?? "0")) || 0), 0);
        const extra = fuelSubTotal + tollFee + misc;
        if (extra <= 0) continue;
        stepMonthly(d, (m) => {
          m.liquidation += extra;
        });
        if (!inWindow(d)) continue;
        const owner = ftiRequests.find((req) => req.controlNo === controlNo);
        const row = owner ? byUser.get(owner.userId) : undefined;
        if (!row) continue;
        row.liquidationTotal += extra;
      }

      for (const [userId, ids] of countedLiq) {
        byUser.get(userId)!.liquidationCount = ids.size;
      }
    } catch (e) {
      console.warn("Failed to compute liquidation expenses:", e);
    }
for (const row of rows) {
      row.srTotal = row.srWithDrTotal + row.srWithoutDrTotal;
      row.net = row.srTotal - row.liquidationTotal;
    }

    for (const m of monthly) {
      m.srTotal = m.srWithDr + m.srWithoutDr;
      m.net = m.srTotal - m.liquidation;
    }

    const totals: TechnicianEarningsResponse["totals"] = {
      srWithDr: rows.reduce((s, r) => s + r.srWithDrTotal, 0),
      srWithDrCount: rows.reduce((s, r) => s + r.srWithDrCount, 0),
      srWithoutDr: rows.reduce((s, r) => s + r.srWithoutDrTotal, 0),
      srWithoutDrCount: rows.reduce((s, r) => s + r.srWithoutDrCount, 0),
      srTotal: rows.reduce((s, r) => s + r.srTotal, 0),
      fti: rows.reduce((s, r) => s + r.ftiTotal, 0),
      liquidation: rows.reduce((s, r) => s + r.liquidationTotal, 0),
      net: rows.reduce((s, r) => s + r.net, 0),
    };

    const response: TechnicianEarningsResponse = {
      period: { year, month, startDate, endDate },
      department: { departmentId: deptId, name: deptName },
      monthly,
      totals,
      technicians: rows,
      excluded: {
        noDelivererCount,
        noDelivererTotal,
        outsideDeptCount,
        outsideDeptTotal,
      },
    };

    return NextResponse.json(response, { status: 200 });
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Failed to generate technician earnings report.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}