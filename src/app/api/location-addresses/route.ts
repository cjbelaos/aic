import { NextResponse } from "next/server";
import { requireAuthenticatedSession } from "@/lib/auth/session";
import {
  getLocationAddresses,
  addLocationAddress,
} from "@/lib/locationAddressSheets";
import { CreateLocationAddressPayload } from "@/types/locationAddress";

export async function GET() {
  const session = await requireAuthenticatedSession();
  if (session instanceof Response) return session;

  try {
    const locations = await getLocationAddresses();
    return NextResponse.json(locations, { status: 200 });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to fetch locations.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const session = await requireAuthenticatedSession();
  if (session instanceof Response) return session;

  try {
    const body: CreateLocationAddressPayload = await request.json();
    if (!body.locationName || !body.locationName.trim()) {
      return NextResponse.json(
        { error: "Location name is required." },
        { status: 400 },
      );
    }
    if (!body.address || !body.address.trim()) {
      return NextResponse.json(
        { error: "Address is required." },
        { status: 400 },
      );
    }
    const created = await addLocationAddress(body);
    return NextResponse.json(created, { status: 201 });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to create location.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}