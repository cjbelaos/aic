import { NextResponse } from "next/server";
import {
  getAllFTIRequests,
  getFTIDetails,
  getFTIExpenses,
} from "@/lib/ftiSheets";
import { getUsers } from "@/lib/userSheets";
import { getSession } from "@/lib/auth/session";

const GENERIC_DEST = "AERICH INNOVATION CORP.";

export async function GET() {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json(
        { error: "Authentication required." },
        { status: 401 },
      );
    }

    const [requests, users] = await Promise.all([
      getAllFTIRequests(),
      getUsers(),
    ]);

    const userMap = new Map(users.map((u) => [u.userId, u.fullName]));
    const isAdmin = session.userRoleId === 1;
    const currentUserId = session.userId;

    // Filter: admin sees all, regular users see only their own
    const filtered = isAdmin
      ? requests
      : requests.filter((r) => r.userId === currentUserId);

    // Build entries with aggregated details + expenses per controlNo
    const entries: any[] = [];

    for (const req of filtered) {
      const details = await getFTIDetails(req.controlNo);
      const technician = userMap.get(req.userId) || req.userId;

      for (const det of details) {
        const expenses = await getFTIExpenses(det.detailId);
        const miscCodes = expenses.map((e) => e.miscCode).join(", ");
        const miscAmount = expenses.reduce((s, e) => s + e.amount, 0);

        entries.push({
          id: `${req.controlNo}-${det.detailId}`,
          ftiRef: req.controlNo,
          technician,
          date: det.date,
          itinerary: det.itinerary,
          description: det.description,
          kilometer: det.km,
          fuelPrice: det.fuelPrice,
          tollFee: det.tollFee,
          miscellaneous: miscCodes,
          miscAmount,
          status: req.status,
          origin: GENERIC_DEST,
          destinations: [],
        });
      }
    }

    // Extract unique FTI refs for the dropdown
    const ftiRefs = [...new Set(entries.map((e) => e.ftiRef))]
      .filter(Boolean)
      .sort();

    return NextResponse.json({
      entries,
      ftiRefs,
      isAdmin,
      currentUser: session.fullName,
    });
  } catch (error) {
    console.error("FTI list fetch error:", error);
    return NextResponse.json(
      { error: "Failed to load FTI entries" },
      { status: 500 },
    );
  }
}
