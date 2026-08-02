import { NextRequest, NextResponse } from "next/server";
import { getTollMatrix } from "@/lib/ftiSheets";
import { calculateSegmentFee } from "@/lib/tollMatrix";

export async function POST(req: NextRequest) {
  try {
    const { entry, exit } = await req.json();
    if (!entry || !exit) {
      return NextResponse.json(
        { error: "Entry and Exit points are required" },
        { status: 400 },
      );
    }

    const tollData = await getTollMatrix();
    const fee = calculateSegmentFee(tollData, entry, exit);

    return NextResponse.json({ fee });
  } catch (error) {
    console.error("Toll lookup error:", error);
    return NextResponse.json(
      { error: "Failed to calculate toll fee" },
      { status: 500 },
    );
  }
}
