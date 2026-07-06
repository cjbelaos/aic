import { NextResponse } from "next/server";
import {
  updateSupplierInSheets,
  deleteSupplierFromSheets,
} from "@/lib/supplierSheets";
import { UpdateSupplierPayload } from "@/types/supplier";

interface RouteParams {
  params: Promise<{
    id: string;
  }>;
}

/**
 * PUT: Update an existing supplier record
 * Endpoint: /api/suppliers/[id]
 */
export async function PUT(request: Request, { params }: RouteParams) {
  try {
    // Await the asynchronous params object
    const { id } = await params;
    const body = await request.json();

    if (!id) {
      return NextResponse.json(
        { error: "Missing supplier identifier parameter" },
        { status: 400 },
      );
    }

    // Consolidate the id from the URL parameter onto the request payload
    const updatePayload: UpdateSupplierPayload = {
      ...body,
      id,
    };

    // Execute the Google Sheet row modification
    const updatedSupplier = await updateSupplierInSheets(updatePayload);

    return NextResponse.json(updatedSupplier, { status: 200 });
  } catch (error) {
    console.error(`[SUPPLIER_PUT_ERROR] Failed updating row entry:`, error);
    return NextResponse.json(
      { error: "Internal Server Error during supplier update operation" },
      { status: 500 },
    );
  }
}

/**
 * DELETE: Remove or wipe a supplier record
 * Endpoint: /api/suppliers/[id]
 */
export async function DELETE(request: Request, { params }: RouteParams) {
  try {
    // Await the asynchronous params object
    const { id } = await params;

    if (!id) {
      return NextResponse.json(
        { error: "Missing supplier identifier parameter" },
        { status: 400 },
      );
    }

    // Execute the Google Sheet cell wipe or row clear logic
    await deleteSupplierFromSheets(id);

    return NextResponse.json(
      { message: `Supplier entry ${id} successfully removed` },
      { status: 200 },
    );
  } catch (error) {
    console.error(`[SUPPLIER_DELETE_ERROR] Failed purging row entry:`, error);
    return NextResponse.json(
      { error: "Internal Server Error during supplier deletion operation" },
      { status: 500 },
    );
  }
}
