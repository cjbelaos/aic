import { NextResponse } from "next/server";
import { getBearerToken, verifyMobileToken } from "@/lib/jwt";
import { recordAttendance } from "@/lib/attendance";

/**
 * POST /api/mobile/attendance
 *
 * Records a clock-in / clock-out entry for the authenticated mobile user.
 *
 * Header: Authorization: Bearer <JWT_TOKEN>
 * Body:   { "type": "CLOCK_IN" | "CLOCK_OUT", "location"?: string }
 * 200:    { "message": string, "type": "CLOCK_IN" | "CLOCK_OUT" }
 */
export async function POST(request: Request) {
  try {
    // 1. Extract and verify the Bearer token
    const token = getBearerToken(request);
    if (!token) {
      return NextResponse.json(
        { error: "Authorization header with a Bearer token is required." },
        { status: 401 },
      );
    }

    const payload = verifyMobileToken(token);
    if (!payload) {
      return NextResponse.json(
        { error: "Invalid or expired token." },
        { status: 401 },
      );
    }

    // 2. Parse and validate the request body
    const body = await request.json();
    const type = String(body.type || "").trim();
    const location =
      body.location !== undefined ? String(body.location).trim() : undefined;

    if (type !== "CLOCK_IN" && type !== "CLOCK_OUT") {
      return NextResponse.json(
        {
          error: `Invalid attendance type "${type}". Must be "CLOCK_IN" or "CLOCK_OUT".`,
        },
        { status: 400 },
      );
    }

    // 3. Append the attendance row to the Attendance sheet
    await recordAttendance(payload.userId, type, location);

    // 4. Success response
    return NextResponse.json({
      message: "Attendance recorded successfully.",
      type,
    });
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Failed to record attendance.";
    return NextResponse.json(
      { error: message },
      { status: 500 },
    );
  }
}