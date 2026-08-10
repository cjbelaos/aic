import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { getAllScheduleEntries, addScheduleEntry } from "@/lib/scheduleSheets";
import type { CreateSchedulePayload } from "@/types/schedule";

export async function GET() {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json(
        { error: "Authentication required." },
        { status: 401 },
      );
    }
    const entries = await getAllScheduleEntries();
    return NextResponse.json(entries);
  } catch (error) {
    console.error("GET /api/schedule error:", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Failed to load schedule",
      },
      { status: 500 },
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json(
        { error: "Authentication required." },
        { status: 401 },
      );
    }
    const body = (await req.json()) as CreateSchedulePayload;
    if (
      !body.controlNo ||
      !body.date ||
      !body.technician ||
      !body.customerName
    ) {
      return NextResponse.json(
        {
          error:
            "Missing required fields: controlNo, date, technician, customerName",
        },
        { status: 400 },
      );
    }
    const entry = await addScheduleEntry(body);
    return NextResponse.json(entry);
  } catch (error) {
    console.error("POST /api/schedule error:", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Failed to create schedule entry",
      },
      { status: 500 },
    );
  }
}
