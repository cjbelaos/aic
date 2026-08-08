import { NextResponse } from "next/server";
import {
  updateCompanyContactInSheets,
  deleteCompanyContactFromSheets,
} from "@/lib/companyContactSheets";
import { UpdateCompanyContactPayload } from "@/types/companyContact";

interface RouteParams {
  params: Promise<{ id: string }>;
}

export async function PUT(request: Request, { params }: RouteParams) {
  try {
    const { id } = await params;
    const body = await request.json();
    if (!id) {
      return NextResponse.json(
        { error: "Missing company contact identifier parameter" },
        { status: 400 },
      );
    }
    const updatePayload: UpdateCompanyContactPayload = { ...body, id };
    const updated = await updateCompanyContactInSheets(updatePayload);
    return NextResponse.json(updated, { status: 200 });
  } catch (error) {
    console.error(
      `[COMPANY_CONTACT_PUT_ERROR] Failed updating row entry:`,
      error,
    );
    return NextResponse.json(
      {
        error: "Internal Server Error during company contact update operation",
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
        { error: "Missing company contact identifier parameter" },
        { status: 400 },
      );
    }
    await deleteCompanyContactFromSheets(id);
    return NextResponse.json(
      { message: `Company contact entry ${id} successfully removed` },
      { status: 200 },
    );
  } catch (error) {
    console.error(
      `[COMPANY_CONTACT_DELETE_ERROR] Failed purging row entry:`,
      error,
    );
    return NextResponse.json(
      {
        error:
          "Internal Server Error during company contact deletion operation",
      },
      { status: 500 },
    );
  }
}
