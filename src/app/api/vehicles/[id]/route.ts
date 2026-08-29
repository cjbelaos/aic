import { NextResponse } from "next/server";
import { requireAuthenticatedSession } from "@/lib/auth/session";
import { updateVehicle, deleteVehicle } from "@/lib/vehicleSheets";
import { UpdateVehiclePayload } from "@/types/vehicle";

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await requireAuthenticatedSession();
  if (session instanceof Response) return session;

  try {
    const { id } = await params;
    const body: UpdateVehiclePayload = await request.json();
    const vehicle = await updateVehicle(id, body, session.userId);
    return NextResponse.json(vehicle, { status: 200 });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to update vehicle.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await requireAuthenticatedSession();
  if (session instanceof Response) return session;

  try {
    const { id } = await params;
    await deleteVehicle(id);
    return NextResponse.json({ success: true }, { status: 200 });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to delete vehicle.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}