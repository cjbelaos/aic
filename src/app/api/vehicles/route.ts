import { NextResponse } from "next/server";
import { requireAuthenticatedSession } from "@/lib/auth/session";
import { getVehicles, addVehicle } from "@/lib/vehicleSheets";
import { CreateVehiclePayload } from "@/types/vehicle";

export async function GET() {
  const session = await requireAuthenticatedSession();
  if (session instanceof Response) return session;

  try {
    const vehicles = await getVehicles();
    return NextResponse.json(vehicles, { status: 200 });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to fetch vehicles.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const session = await requireAuthenticatedSession();
  if (session instanceof Response) return session;

  try {
    const body: CreateVehiclePayload = await request.json();

    if (!body.makeAndModel?.trim()) {
      return NextResponse.json(
        { error: "Make & Model is required." },
        { status: 400 },
      );
    }
    if (!body.licensePlate?.trim()) {
      return NextResponse.json(
        { error: "License Plate is required." },
        { status: 400 },
      );
    }

    const vehicle = await addVehicle(body, session.userId);
    return NextResponse.json(vehicle, { status: 201 });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to create vehicle.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}