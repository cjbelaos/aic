import { NextResponse } from "next/server";
import { requireAuthenticatedSession } from "@/lib/auth/session";
import { ContractPeriodSummary } from "@/types/contract-release";
import { getContractItems } from "@/lib/contractItemSheets";
import { getPeriodSummaries } from "@/lib/contractPeriodSummarySheets";
import { getProducts } from "@/lib/productSheets";

/**
 * Calculate average days to complete across multiple period summaries.
 */
function calculateAverageDaysToComplete(summaries: ContractPeriodSummary[]): number {
  const completed = summaries.filter(
    (s) => s.status === "Completed" && s.daysToComplete !== undefined,
  );
  if (completed.length === 0) return 0;
  const total = completed.reduce((sum, s) => sum + (s.daysToComplete || 0), 0);
  return Math.round(total / completed.length);
}

/**
 * GET /api/contract-releases/compliance?contractId=CTR-0001&year=2026&month=1
 * Fetches compliance report for a contract.
 */
export async function GET(request: Request) {
  const session = await requireAuthenticatedSession();
  if (session instanceof Response) return session;

  try {
    const { searchParams } = new URL(request.url);
    const contractId = searchParams.get("contractId");
    const year = searchParams.get("year")
      ? parseInt(searchParams.get("year")!, 10)
      : undefined;
    const month = searchParams.get("month")
      ? parseInt(searchParams.get("month")!, 10)
      : undefined;

    if (!contractId?.trim()) {
      return NextResponse.json(
        { error: "Contract ID is required." },
        { status: 400 },
      );
    }

    const contractItems = await getContractItems(contractId);
    const allProducts = await getProducts();
    const reports = [];

    for (const item of contractItems) {
      const summaries = await getPeriodSummaries(item.id, year, month);

      const totalExpected = summaries.reduce((sum, s) => sum + s.entitledQty, 0);
      const totalReleased = summaries.reduce((sum, s) => sum + s.releasedQty, 0);

      // Get product name
      let productName = item.productCode;
      const product = allProducts.find((p) => p.code === item.productCode);
      if (product) productName = product.name;

      reports.push({
        contractItemId: item.id,
        productCode: item.productCode,
        productName,
        frequency: item.frequency,
        entitledQty: item.entitledQty,
        periods: summaries.map((s) => ({
          period: `${s.periodYear}-${String(s.periodMonth).padStart(2, "0")}`,
          expected: s.entitledQty,
          released: s.releasedQty,
          status: s.status,
          releaseDates: [],
        })),
        summary: {
          totalExpected,
          totalReleased,
          complianceRate: totalExpected > 0 ? (totalReleased / totalExpected) * 100 : 0,
          averageDaysToComplete: calculateAverageDaysToComplete(summaries),
        },
      });
    }

    return NextResponse.json(reports, { status: 200 });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to fetch compliance report.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}