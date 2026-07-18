import { NextResponse } from "next/server";
import { requireAuthenticatedSession } from "@/lib/auth/session";
import {
  updateProductCategoryInSheets,
  deleteProductCategoryFromSheets,
} from "@/lib/productCategorySheets";
import { UpdateProductCategoryPayload } from "@/types/product-category";

/**
 * PUT /api/product-categories/[id]
 * Updates an existing product category row by ID.
 */
export async function PUT(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await requireAuthenticatedSession();
  if (session instanceof Response) return session;

  try {
    const { id } = await params;
    const body: Partial<UpdateProductCategoryPayload> = await request.json();

    const payload: UpdateProductCategoryPayload = {
      id,
      ...body,
    };

    const updated = await updateProductCategoryInSheets(payload);
    return NextResponse.json(updated, { status: 200 });
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Failed to update product category.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/**
 * DELETE /api/product-categories/[id]
 * Clears/deletes a product category row by ID.
 */
export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await requireAuthenticatedSession();
  if (session instanceof Response) return session;

  try {
    const { id } = await params;
    await deleteProductCategoryFromSheets(id);
    return NextResponse.json(
      { message: "Product category deleted successfully." },
      { status: 200 },
    );
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Failed to delete product category.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
