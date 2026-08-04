import { NextResponse } from "next/server";
import {
  updateSupplierContactInSheets,
  deleteSupplierContactFromSheets,
} from "@/lib/supplierContactSheets";
import { UpdateSupplierContactPayload } from "@/types/supplierContact";

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function PUT(request: Request, { params }: RouteParams) {
  try {
    const { id } = await params;
    const body = await request.json();
    if (!id) {
      return NextResponse.json(
        { error: "Missing supplier contact identifier parameter" },
        { status: 400 },
      );
    }
    const updatePayload: UpdateSupplierContactPayload = { ...body, id };
    const updated = await updateSupplierContactInSheets(updatePayload);
    return NextResponse.json(updated, { status: 200 });
  } catch (error) {
    console.error(
      `[SUPPLIER_CONTACT_PUT_ERROR] Failed updating row entry:`,
      error,
    );
    return NextResponse.json(
      {
        error: "Internal Server Error during supplier contact update operation",
      },
      { status: 500 },
    );
  }
}

export async function DELETE(request: Request, { params }: RouteParams) {
  try {
    const { id } = await params;
    if (!id) {
      return NextResponse.json(
        { error: "Missing supplier contact identifier parameter" },
        { status: 400 },
      );
    }
    await deleteSupplierContactFromSheets(id);
    return NextResponse.json(
      { message: `Supplier contact entry ${id} successfully removed` },
      { status: 200 },
    );
  } catch (error) {
    console.error(
      `[SUPPLIER_CONTACT_DELETE_ERROR] Failed purging row entry:`,
      error,
    );
    return NextResponse.json(
      {
        error:
          "Internal Server Error during supplier contact deletion operation",
      },
      { status: 500 },
    );
  }
}
