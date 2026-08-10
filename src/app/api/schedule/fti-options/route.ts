import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { getFTILinkOptions } from "@/lib/scheduleSheets";

export async function GET() {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json(
        { error: "Authentication required." },
        { status: 401 },
      );
    }
    const options = await getFTILinkOptions();
    return NextResponse.json(options);
  } catch (error) {
    console.error("GET /api/schedule/fti-options error:", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Failed to load FTI link options",
      },
      { status: 500 },
    );
  }
}
