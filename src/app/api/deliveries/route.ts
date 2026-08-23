import { NextResponse } from "next/server";
import { requireAuthenticatedSession } from "@/lib/auth/session";
import { processDeliveryReceipt } from "@/lib/deliverySheets";
import { CreateDeliveryPayload } from "@/types/delivery";

export async function POST(request: Request) {
  const session = await requireAuthenticatedSession();
  if (session instanceof Response) return session;

  try {
    const body: CreateDeliveryPayload = await request.json();

    if (!body.companyId?.trim()) {
      return NextResponse.json(
        { error: "Company is required." },
        { status: 400 },
      );
    }
    if (!body.preparedBy?.trim()) {
      return NextResponse.json(
        { error: "Prepared by is required." },
        { status: 400 },
      );
    }
    if (!body.deliveredBy?.trim()) {
      return NextResponse.json(
        { error: "Delivered by is required." },
        { status: 400 },
      );
    }
    if (!body.items || body.items.length === 0) {
      return NextResponse.json(
        { error: "At least one product item is required." },
        { status: 400 },
      );
    }

    const result = await processDeliveryReceipt(body);
    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Failed to process delivery receipt.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
