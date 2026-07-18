import { NextResponse } from "next/server";
import { requireAuthenticatedSession } from "@/lib/auth/session";
import {
  updateCustomerPriceInSheets,
  deleteCustomerPriceFromSheets,
} from "@/lib/customerPriceSheets";
import { UpdateCustomerPricePayload } from "@/types/customer-price";

/**
 * PUT /api/customer-prices/[id]
 * Updates an existing customer price row by ID.
 */
export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await requireAuthenticatedSession();
  if (session instanceof Response) return session;

  try {
    const { id } = await params;
    const body: Partial<UpdateCustomerPricePayload> = await request.json();

    const payload: UpdateCustomerPricePayload = {
      id,
      ...body,
    };

    const updated = await updateCustomerPriceInSheets(payload);
    return NextResponse.json(updated, { status: 200 });
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Failed to update customer price.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/**
 * DELETE /api/customer-prices/[id]
 * Clears/deletes a customer price row by ID.
 */
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await requireAuthenticatedSession();
  if (session instanceof Response) return session;

  try {
    const { id } = await params;
    await deleteCustomerPriceFromSheets(id);
    return NextResponse.json(
      { message: "Customer price deleted successfully." },
      { status: 200 },
    );
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Failed to delete customer price.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
