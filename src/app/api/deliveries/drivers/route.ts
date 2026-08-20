import { NextResponse } from "next/server";
import { requireAuthenticatedSession } from "@/lib/auth/session";
import { getDriversFromSheets } from "@/lib/deliverySheets";

/**
 * GET /api/deliveries/drivers
 * Fetches personnel names from the DeliveriesName sheet.
 */
export async function GET() {
  const session = await requireAuthenticatedSession();
  if (session instanceof Response) return session;

  try {
    const drivers = await getDriversFromSheets();
    return NextResponse.json(drivers, { status: 200 });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to fetch drivers.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
