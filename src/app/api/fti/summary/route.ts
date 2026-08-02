import { NextRequest, NextResponse } from "next/server";
import { getAllFTIEntries } from "@/lib/ftiSheets";
import { requireAdminSession } from "@/lib/auth/session";

export async function GET(req: NextRequest) {
  try {
    const session = await requireAdminSession();
    if (session instanceof Response) return session;

    const { searchParams } = new URL(req.url);
    const technician = searchParams.get("technician") || "";
    const dateFrom = searchParams.get("dateFrom") || "";
    const dateTo = searchParams.get("dateTo") || "";

    const allEntries = await getAllFTIEntries();

    // Filter by technician
    let filtered = allEntries;
    if (technician) {
      filtered = filtered.filter(
        (e) =>
          e.technician.trim().toLowerCase() === technician.trim().toLowerCase(),
      );
    }

    // Filter by date range
    if (dateFrom) {
      const from = new Date(dateFrom);
      filtered = filtered.filter((e) => new Date(e.date) >= from);
    }
    if (dateTo) {
      const to = new Date(dateTo);
      to.setHours(23, 59, 59, 999);
      filtered = filtered.filter((e) => new Date(e.date) <= to);
    }

    // Compute summary totals
    const summary = {
      totalToll: filtered.reduce((s, e) => s + e.tollFee, 0),
      totalMiscAmount: filtered.reduce((s, e) => s + e.miscAmount, 0),
      totalFuel: filtered.reduce(
        (s, e) => s + (e.kilometer / 12) * e.fuelPrice,
        0,
      ),
      totalKm: filtered.reduce((s, e) => s + e.kilometer, 0),
      totalEntries: filtered.length,
      totalAmount: filtered.reduce((s, e) => {
        const fuel = (e.kilometer / 12) * e.fuelPrice;
        return s + e.tollFee + e.miscAmount + fuel;
      }, 0),
    };

    // Get distinct technician names
    const technicians = [...new Set(allEntries.map((e) => e.technician))]
      .filter(Boolean)
      .sort();

    return NextResponse.json({
      summary,
      entries: filtered,
      technicians,
      selectedTechnician: technician,
      dateFrom,
      dateTo,
    });
  } catch (error) {
    console.error("FTI summary fetch error:", error);
    return NextResponse.json(
      { error: "Failed to load FTI summary" },
      { status: 500 },
    );
  }
}
