import { NextResponse } from "next/server";
import { requireAuthenticatedSession } from "@/lib/auth/session";
import {
  getContracts,
  updateContractInSheets,
  deleteContractFromSheets,
} from "@/lib/contractSheets";
import { UpdateContractPayload } from "@/types/contract";

/**
 * GET /api/contracts/[id]
 * Fetches a single contract header by ID.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await requireAuthenticatedSession();
  if (session instanceof Response) return session;

  try {
    const { id } = await params;
    const contracts = await getContracts();
    const contract = contracts.find((c) => c.id === id);

    if (!contract) {
      return NextResponse.json(
        { error: `Contract with ID ${id} not found.` },
        { status: 404 },
      );
    }

    return NextResponse.json(contract, { status: 200 });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to fetch contract.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/**
 * PUT /api/contracts/[id]
 * Updates an existing contract header by ID.
 */
export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await requireAuthenticatedSession();
  if (session instanceof Response) return session;

  try {
    const { id } = await params;
    const body: Partial<UpdateContractPayload> = await request.json();

    const payload: UpdateContractPayload = {
      id,
      ...body,
    };

    const updated = await updateContractInSheets(payload);
    return NextResponse.json(updated, { status: 200 });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to update contract.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/**
 * DELETE /api/contracts/[id]
 * Removes/clears a contract header row by ID.
 */
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await requireAuthenticatedSession();
  if (session instanceof Response) return session;

  try {
    const { id } = await params;
    await deleteContractFromSheets(id);
    return NextResponse.json(
      { message: "Contract deleted successfully." },
      { status: 200 },
    );
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to delete contract.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
