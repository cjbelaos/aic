import { NextResponse } from "next/server";
import { updateProductUnit, deleteProductUnit } from "@/lib/productUnitSheets";
import { UpdateProductUnitPayload } from "@/types/product-unit";

interface RouteParams {
  params: {
    id: string;
  };
}

/**
 * PUT: Update an existing product unit record
 * Endpoint: /api/product-units/[id]
 */
export async function PUT(request: Request, { params }: RouteParams) {
  try {
    const { id } = params;
    const body = await request.json();

    if (!id) {
      return NextResponse.json(
        { error: "Missing product unit identifier parameter" },
        { status: 400 },
      );
    }

    // Consolidate the id from the URL parameter onto the request payload
    const updatePayload: UpdateProductUnitPayload = {
      ...body,
      id,
    };

    // Execute the Google Sheet row modification
    const updatedProductUnit = await updateProductUnit(updatePayload);

    return NextResponse.json(updatedProductUnit, { status: 200 });
  } catch (error) {
    console.error(`[PRODUCT_UNIT_PUT_ERROR] Failed updating row entry:`, error);
    return NextResponse.json(
      { error: "Internal Server Error during product unit update operation" },
      { status: 500 },
    );
  }
}

/**
 * DELETE: Remove or wipe a product unit record
 * Endpoint: /api/product-units/[id]
 */
export async function DELETE(request: Request, { params }: RouteParams) {
  try {
    const { id } = params;

    if (!id) {
      return NextResponse.json(
        { error: "Missing product unit identifier parameter" },
        { status: 400 },
      );
    }

    // Execute the Google Sheet cell wipe or row clear logic
    await deleteProductUnit(id);

    return NextResponse.json(
      { message: `Product unit entry ${id} successfully removed` },
      { status: 200 },
    );
  } catch (error) {
    console.error(
      `[PRODUCT_UNIT_DELETE_ERROR] Failed purging row entry:`,
      error,
    );
    return NextResponse.json(
      { error: "Internal Server Error during product unit deletion operation" },
      { status: 500 },
    );
  }
}
