import { NextResponse } from "next/server";
import { requireAuthenticatedSession } from "@/lib/auth/session";
import {
  updateLocationAddressInSheets,
  deleteLocationAddressFromSheets,
} from "@/lib/locationAddressSheets";
import { CreateLocationAddressPayload } from "@/types/locationAddress";

interface RouteParams {
  params: Promise<{
    id: string;
  }>;
}

export async function PUT(request: Request, { params }: RouteParams) {
  const session = await requireAuthenticatedSession();
  if (session instanceof Response) return session;

  try {
    const { id } = await params;

    if (!id) {
      return NextResponse.json(
        { error: "Missing location identifier parameter" },
        { status: 400 },
      );
    }

    const body = await request.json();
    const payload: CreateLocationAddressPayload & { id: string } = {
      ...body,
      id,
    };

    if (!payload.locationName || !payload.locationName.trim()) {
      return NextResponse.json(
        { error: "Location name is required." },
        { status: 400 },
      );
    }
    if (!payload.address || !payload.address.trim()) {
      return NextResponse.json(
        { error: "Address is required." },
        { status: 400 },
      );
    }

    const updated = await updateLocationAddressInSheets(payload);
    return NextResponse.json(updated, { status: 200 });
  } catch (error) {
    console.error(`[LOCATION_PUT_ERROR] Failed updating row entry:`, error);
    return NextResponse.json(
      { error: "Internal Server Error during location update operation" },
      { status: 500 },
    );
  }
}

export async function DELETE(request: Request, { params }: RouteParams) {
  const session = await requireAuthenticatedSession();
  if (session instanceof Response) return session;

  try {
    const { id } = await params;

    if (!id) {
      return NextResponse.json(
        { error: "Missing location identifier parameter" },
        { status: 400 },
      );
    }

    await deleteLocationAddressFromSheets(id);

    return NextResponse.json(
      { message: `Location entry ${id} successfully removed` },
      { status: 200 },
    );
  } catch (error) {
    console.error(`[LOCATION_DELETE_ERROR] Failed purging row entry:`, error);
    return NextResponse.json(
      { error: "Internal Server Error during location deletion operation" },
      { status: 500 },
    );
  }
}