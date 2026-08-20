import { NextResponse } from "next/server";
import { requireAuthenticatedSession } from "@/lib/auth/session";
import {
  updateContractItemInSheets,
  deleteContractItemFromSheets,
} from "@/lib/contractItemSheets";
import { UpdateContractItemPayload } from "@/types/contract";

/**
 * PUT /api/contract-items/[id]
 * Updates an existing contract line item by ID.
 */
export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await requireAuthenticatedSession();
  if (session instanceof Response) return session;

  try {
    const { id } = await params;
    const body: Partial<UpdateContractItemPayload> = await request.json();

    const payload: UpdateContractItemPayload = {
      id,
      ...body,
    };

    const updated = await updateContractItemInSheets(payload);
    return NextResponse.json(updated, { status: 200 });
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Failed to update contract item.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/**
 * DELETE /api/contract-items/[id]
 * Removes/clears a contract line item row by ID.
 */
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await requireAuthenticatedSession();
  if (session instanceof Response) return session;

  try {
    const { id } = await params;
    await deleteContractItemFromSheets(id);
    return NextResponse.json(
      { message: "Contract item deleted successfully." },
      { status: 200 },
    );
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Failed to delete contract item.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
