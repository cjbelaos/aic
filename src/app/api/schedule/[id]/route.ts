import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import {
  updateScheduleEntryInSheets,
  deleteScheduleEntryFromSheets,
} from "@/lib/scheduleSheets";
import type { UpdateSchedulePayload } from "@/types/schedule";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json(
        { error: "Authentication required." },
        { status: 401 },
      );
    }
    const { id } = await params;
    const body = (await req.json()) as UpdateSchedulePayload;
    const entry = await updateScheduleEntryInSheets(id, body);
    return NextResponse.json(entry);
  } catch (error) {
    console.error(`PATCH /api/schedule/[id] error:`, error);
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Failed to update schedule entry",
      },
      { status: 500 },
    );
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json(
        { error: "Authentication required." },
        { status: 401 },
      );
    }
    const { id } = await params;
    await deleteScheduleEntryFromSheets(id);
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error(`DELETE /api/schedule/[id] error:`, error);
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Failed to delete schedule entry",
      },
      { status: 500 },
    );
  }
}
