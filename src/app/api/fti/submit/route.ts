import { NextRequest, NextResponse } from "next/server";
import { submitFTIEntry, submitFTIEntries } from "@/lib/ftiSheets";

export async function POST(req: NextRequest) {
  try {
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

      const rows = items.map((item: any) => ({
        technician: item.technician || "",
        date: item.date || "",
        itinerary: (item.itinerary || "").toUpperCase(),
        description: (item.description || "").toUpperCase(),
        kilometer: (item.kilometer ?? "0").toString(),
        fuelPrice: (item.fuelPrice ?? "0").toString(),
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
      fuelPrice,
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
      fuelPrice: fuelPrice || "0",
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
