import { NextResponse } from "next/server";
import { requireAuthenticatedSession } from "@/lib/auth/session";
import { ContractRelease, ContractPeriodSummary } from "@/types/contract-release";
import { getPeriodInfo, getPeriodId, formatDate } from "@/lib/utils/contractRelease.utils";
import { getContractItems } from "@/lib/contractItemSheets";
import { getContractReleases, addContractRelease, generateReleaseId } from "@/lib/contractReleaseSheets";
import { upsertPeriodSummary } from "@/lib/contractPeriodSummarySheets";
import { getContracts } from "@/lib/contractSheets";

/**
 * Calculate days between first and last release date.
 */
function calculateDaysToComplete(releases: ContractRelease[]): number {
  if (releases.length < 2) return 0;
  const sorted = [...releases].sort(
    (a, b) => new Date(a.releaseDate).getTime() - new Date(b.releaseDate).getTime(),
  );
  const first = new Date(sorted[0].releaseDate);
  const last = new Date(sorted[sorted.length - 1].releaseDate);
  return Math.ceil((last.getTime() - first.getTime()) / (1000 * 60 * 60 * 24));
}

/**
 * Update (or create) the period summary for a given contract item + period.
 */
async function updatePeriodSummary(
  contractItemId: string,
  periodInfo: { year: number; month: number; quarter: number; periodStart: Date; periodEnd: Date },
): Promise<ContractPeriodSummary> {
  const releases = await getContractReleases(
    contractItemId,
    periodInfo.year,
    periodInfo.month,
  );

  const contractItems = await getContractItems();
  const contractItem = contractItems.find((item) => item.id === contractItemId);

  if (!contractItem) {
    throw new Error(`Contract item ${contractItemId} not found.`);
  }

  const totalReleased = releases.filter((r) => r.status !== "Deleted").reduce((sum, r) => sum + r.quantity, 0);
  const entitledQty = contractItem.entitledQty;

  // Determine status
  let status: ContractPeriodSummary["status"];
  if (totalReleased >= entitledQty) {
    status = "Completed";
  } else if (totalReleased === 0) {
    status = "Pending";
  } else {
    status = "Partial";
  }

  // Check if overdue (period passed)
  const today = new Date();
  if (
    status !== "Completed" &&
    today > periodInfo.periodEnd &&
    totalReleased > 0
  ) {
    status = "Overdue";
  }

  const sortedReleases = [...releases].sort(
    (a, b) => new Date(a.releaseDate).getTime() - new Date(b.releaseDate).getTime(),
  );

  const summary: ContractPeriodSummary = {
    periodId: getPeriodId(contractItemId, periodInfo),
    contractItemId,
    contractId: contractItem.contractId,
    productCode: contractItem.productCode,
    periodYear: periodInfo.year,
    periodMonth: periodInfo.month,
    periodQuarter: periodInfo.quarter,
    frequency: contractItem.frequency,
    entitledQty,
    releasedQty: totalReleased,
    releaseCount: releases.length,
    firstReleaseDate: sortedReleases.length > 0 ? sortedReleases[0].releaseDate : undefined,
    lastReleaseDate: sortedReleases.length > 0 ? sortedReleases[sortedReleases.length - 1].releaseDate : undefined,
    status,
    daysToComplete: status === "Completed" ? calculateDaysToComplete(sortedReleases) : undefined,
    periodStart: formatDate(periodInfo.periodStart),
    periodEnd: formatDate(periodInfo.periodEnd),
  };

  await upsertPeriodSummary(summary);
  return summary;
}

/**
 * POST /api/contract-releases/process
 * Processes a new release: validates, creates record, updates period summary.
 * If contractItemId is empty, treats it as a non-contracted (extra) item release.
 */
export async function POST(request: Request) {
  const session = await requireAuthenticatedSession();
  if (session instanceof Response) return session;

  try {
    const body = await request.json();
    const { contractItemId, contractId, productCode, quantity, releaseDate, releasedBy, remarks, drNumber } = body;

    // Validation
    if (!quantity || quantity < 1) {
      return NextResponse.json(
        { error: "Quantity must be at least 1." },
        { status: 400 },
      );
    }
    if (!releaseDate?.trim()) {
      return NextResponse.json(
        { error: "Release date is required." },
        { status: 400 },
      );
    }
    if (!releasedBy?.trim()) {
      return NextResponse.json(
        { error: "Released by is required." },
        { status: 400 },
      );
    }

    const date = new Date(releaseDate);

    // Case 1: Contracted item release
    if (contractItemId) {
      const contractItems = await getContractItems();
      const contractItem = contractItems.find((item) => item.id === contractItemId);

      if (!contractItem) {
        return NextResponse.json(
          { error: `Contract item ${contractItemId} not found.` },
          { status: 404 },
        );
      }

      const periodInfo = getPeriodInfo(date, contractItem.frequency);

      // Check if release is within valid period
      if (date < periodInfo.periodStart || date > periodInfo.periodEnd) {
        return NextResponse.json(
          { error: `Release date must be within the ${contractItem.frequency} period.` },
          { status: 400 },
        );
      }

      // Check if period already has releases and calculate remaining
      const existingReleases = await getContractReleases(
        contractItemId,
        periodInfo.year,
        periodInfo.month,
      );

      const totalReleased = existingReleases
        .filter((r) => r.status !== "Deleted")
        .reduce((sum, r) => sum + r.quantity, 0);
      const remaining = contractItem.entitledQty - totalReleased;

      if (quantity > remaining) {
        return NextResponse.json(
          { error: `Only ${remaining} units remaining for this period. ${quantity} requested.` },
          { status: 400 },
        );
      }

      // Create release record
      const releaseId = await generateReleaseId();
      const release: ContractRelease = {
        id: releaseId,
        contractItemId,
        contractId: contractItem.contractId,
        periodYear: periodInfo.year,
        periodMonth: periodInfo.month,
        periodQuarter: periodInfo.quarter,
        frequency: contractItem.frequency,
        releaseDate,
        quantity,
        releasedBy,
        remarks,
        status: "Completed",
        drNumber,
      };

      // Save release
      await addContractRelease(release);

      // Update period summary
      await updatePeriodSummary(contractItemId, periodInfo);

      return NextResponse.json(release, { status: 201 });
    }

    // Case 2: Non-contracted (extra) item release
    if (!contractId || !productCode) {
      return NextResponse.json(
        { error: "Contract ID and product code are required for non-contracted items." },
        { status: 400 },
      );
    }

    const contracts = await getContracts();
    const contract = contracts.find((c) => c.id === contractId);
    if (!contract) {
      return NextResponse.json(
        { error: `Contract ${contractId} not found.` },
        { status: 404 },
      );
    }

    // Use Monthly frequency as default for non-contracted items
    const periodInfo = getPeriodInfo(date, "Monthly");

    // Create release record
    const releaseId = await generateReleaseId();
    const release: ContractRelease = {
      id: releaseId,
      contractItemId: "",
      contractId,
      periodYear: periodInfo.year,
      periodMonth: periodInfo.month,
      periodQuarter: periodInfo.quarter,
      frequency: "Monthly",
      releaseDate,
      quantity,
      releasedBy,
      remarks,
      status: "Completed",
      drNumber,
    };

    // Save release
    await addContractRelease(release);

    return NextResponse.json(release, { status: 201 });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to process release.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}