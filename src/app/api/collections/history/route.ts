import { NextResponse } from "next/server";
import {
  getCollectionHistory,
  logCollectionToSheets,
} from "@/lib/collectionSheets";

// GET: Fetch collection history
export async function GET() {
  try {
    const history = await getCollectionHistory();
    return NextResponse.json(history);
  } catch (error: any) {
    console.error("GET /api/collections/history Error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to fetch collection history." },
      { status: 500 },
    );
  }
}

// POST: Log completed collection and update schedule status
export async function POST(req: Request) {
  try {
    const body = await req.json();
    const {
      scheduledCollectionId,
      companyId,
      description,
      amountCollected,
      collectedDate,
    } = body;

    if (!companyId || !amountCollected || !collectedDate) {
      return NextResponse.json(
        {
          error: "companyId, amountCollected, and collectedDate are required.",
        },
        { status: 400 },
      );
    }

    const newHistoryEntry = await logCollectionToSheets({
      scheduledCollectionId,
      companyId,
      description,
      amountCollected: Number(amountCollected),
      collectedDate,
    });

    return NextResponse.json(newHistoryEntry);
  } catch (error: any) {
    console.error("POST /api/collections/history Error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to log collection entry." },
      { status: 500 },
    );
  }
}
