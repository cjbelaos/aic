import { NextResponse } from "next/server";
import {
  getScheduledCollections,
  addScheduledCollection,
  updateScheduledStatus,
} from "@/lib/collectionSheets";

// GET: Fetch all active/pending scheduled collections
export async function GET() {
  try {
    const collections = await getScheduledCollections();
    return NextResponse.json(collections);
  } catch (error: any) {
    console.error("GET /api/collections/scheduled Error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to fetch scheduled collections." },
      { status: 500 },
    );
  }
}

// POST: Add new scheduled collection call
export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { companyId, scheduledDate, notes } = body;

    if (!companyId || !scheduledDate) {
      return NextResponse.json(
        { error: "companyId and scheduledDate are required." },
        { status: 400 },
      );
    }

    const newSchedule = await addScheduledCollection({
      companyId,
      scheduledDate,
      notes,
    });

    return NextResponse.json(newSchedule);
  } catch (error: any) {
    console.error("POST /api/collections/scheduled Error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to create schedule." },
      { status: 500 },
    );
  }
}

// PATCH: Update status of a scheduled collection (e.g. CANCELLED, PENDING, COMPLETED)
export async function PATCH(req: Request) {
  try {
    const body = await req.json();
    const { id, status } = body;

    if (!id || !status) {
      return NextResponse.json(
        { error: "id and status are required." },
        { status: 400 },
      );
    }

    await updateScheduledStatus(id, status);

    return NextResponse.json({
      success: true,
      id,
      status,
    });
  } catch (error: any) {
    console.error("PATCH /api/collections/scheduled Error:", error);
    return NextResponse.json(
      {
        error: error.message || "Failed to update scheduled collection status.",
      },
      { status: 500 },
    );
  }
}
