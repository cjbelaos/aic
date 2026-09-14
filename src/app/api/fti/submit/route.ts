import { NextRequest, NextResponse } from "next/server";
import { submitFTIEntry, submitFTIEntries } from "@/lib/ftiSheets";
import { requireAuthenticatedSession } from "@/lib/auth/session";
import { getGlobalFuelPrice } from "@/lib/ftiFuelPrice";

export async function POST(req: NextRequest) {
  try {
    const session = await requireAuthenticatedSession();
    if (session instanceof Response) return session;
    const globalFuelPrice = await getGlobalFuelPrice();
    if (globalFuelPrice === null) {
      return NextResponse.json(
        { error: "Fuel price has not been configured by the After Sales Manager." },
        { status: 400 },
      );
    }
    const body = await req.json();

    // Support both batch and single (array) submissions
    if (body.items && Array.isArray(body.items)) {
      // ── Batch submission ──
      const { items, ftiRef } = body;
      if (!ftiRef) {
        return NextResponse.json(
          { error: "Missing required field: ftiRef" },
          { status: 400 },
        );
      }

      const rows = items.map((item: Record<string, unknown>) => ({
        technician: item.technician || "",
        date: item.date || "",
        itinerary: String(item.itinerary || "").toUpperCase(),
        description: String(item.description || "").toUpperCase(),
        kilometer: (item.kilometer ?? "0").toString(),
        fuelPrice: String(globalFuelPrice),
        tollFee: (item.tollFee ?? "0").toString(),
        miscellaneous: item.miscellaneous || "",
        miscAmount: (item.miscAmount ?? "0").toString(),
        ftiRef,
        status: "SAVED",
      }));

      await submitFTIEntries(rows);
      return NextResponse.json({ success: true, ftiRef, count: rows.length });
    }

    // ── Single submission (backward compatible) ──
    const {
      technician,
      date,
      itinerary,
      description,
      kilometer,
      tollFee,
      miscellaneous,
      miscAmount,
      ftiRef,
    } = body;

    if (!technician || !date || !itinerary || !ftiRef) {
      return NextResponse.json(
        {
          error: "Missing required fields: technician, date, itinerary, ftiRef",
        },
        { status: 400 },
      );
    }

    await submitFTIEntry({
      technician,
      date,
      itinerary: itinerary.toUpperCase(),
      description: (description || "").toUpperCase(),
      kilometer: kilometer || "0",
      fuelPrice: String(globalFuelPrice),
      tollFee: tollFee || "0",
      miscellaneous: miscellaneous || "",
      miscAmount: miscAmount || "0",
      ftiRef,
      status: "SAVED",
    });

    return NextResponse.json({ success: true, ftiRef });
  } catch (error) {
    console.error("FTI submit error:", error);
    return NextResponse.json(
      { error: "Failed to submit FTI entry" },
      { status: 500 },
    );
  }
}
