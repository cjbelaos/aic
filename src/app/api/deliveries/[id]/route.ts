import { NextResponse } from "next/server";
import { requireAuthenticatedSession } from "@/lib/auth/session";
import {
  updateDeliveryReceipt,
  deleteDeliveryReceipt,
  UpdateDeliveryPayload,
} from "@/lib/deliverySheets";

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await requireAuthenticatedSession();
  if (session instanceof Response) return session;

  try {
    const { id } = await params;
    const drNumber = parseInt(id, 10);
    if (isNaN(drNumber)) {
      return NextResponse.json({ error: "Invalid DR number." }, { status: 400 });
    }

    const body: UpdateDeliveryPayload = await request.json();
    const result = await updateDeliveryReceipt(drNumber, body);
    return NextResponse.json(result, { status: 200 });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to update delivery receipt.";
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
    const drNumber = parseInt(id, 10);
    if (isNaN(drNumber)) {
      return NextResponse.json({ error: "Invalid DR number." }, { status: 400 });
    }

    await deleteDeliveryReceipt(drNumber);
    return NextResponse.json({ success: true }, { status: 200 });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to delete delivery receipt.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}