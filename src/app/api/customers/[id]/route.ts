import { NextResponse } from "next/server";
import {
  updateCustomerInSheets,
  deleteCustomerFromSheets,
} from "@/lib/customerSheets";
import { UpdateCustomerPayload } from "@/types/customer";

// Updated to expect params as a Promise for Next.js 15/16 compliance
interface RouteParams {
  params: Promise<{
    id: string;
  }>;
}

/**
 * PUT: Update an existing customer record
 * Endpoint: /api/customers/[id]
 */
export async function PUT(request: Request, { params }: RouteParams) {
  try {
    // Await the asynchronous params object
    const { id } = await params;
    const body = await request.json();

    if (!id) {
      return NextResponse.json(
        { error: "Missing customer identifier parameter" },
        { status: 400 },
      );
    }

    // Consolidate the id from the URL parameter onto the request payload
    const updatePayload: UpdateCustomerPayload = {
      ...body,
      id,
    };

    // Execute the Google Sheet row modification
    const updatedCustomer = await updateCustomerInSheets(updatePayload);

    return NextResponse.json(updatedCustomer, { status: 200 });
  } catch (error) {
    console.error(`[CUSTOMER_PUT_ERROR] Failed updating row entry:`, error);
    return NextResponse.json(
      { error: "Internal Server Error during customer update operation" },
      { status: 500 },
    );
  }
}

/**
 * DELETE: Remove or wipe a customer record
 * Endpoint: /api/customers/[id]
 */
export async function DELETE(request: Request, { params }: RouteParams) {
  try {
    // Await the asynchronous params object
    const { id } = await params;

    if (!id) {
      return NextResponse.json(
        { error: "Missing customer identifier parameter" },
        { status: 400 },
      );
    }

    // Execute the Google Sheet cell wipe or row clear logic
    await deleteCustomerFromSheets(id);

    return NextResponse.json(
      { message: `Customer entry ${id} successfully removed` },
      { status: 200 },
    );
  } catch (error) {
    console.error(`[CUSTOMER_DELETE_ERROR] Failed purging row entry:`, error);
    return NextResponse.json(
      { error: "Internal Server Error during customer deletion operation" },
      { status: 500 },
    );
  }
}
