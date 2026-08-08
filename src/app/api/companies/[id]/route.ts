import { NextResponse } from "next/server";
import {
  updateCompanyInSheets,
  deleteCompanyFromSheets,
} from "@/lib/companySheets";
import { UpdateCompanyPayload } from "@/types/company";

interface RouteParams {
  params: Promise<{
    id: string;
  }>;
}

export async function PUT(request: Request, { params }: RouteParams) {
  try {
    const { id } = await params;
    const body = await request.json();

    if (!id) {
      return NextResponse.json(
        { error: "Missing company identifier parameter" },
        { status: 400 },
      );
    }

    const updatePayload: UpdateCompanyPayload = {
      ...body,
      id,
    };

    const updatedCompany = await updateCompanyInSheets(updatePayload);

    return NextResponse.json(updatedCompany, { status: 200 });
  } catch (error) {
    console.error(`[COMPANY_PUT_ERROR] Failed updating row entry:`, error);
    return NextResponse.json(
      { error: "Internal Server Error during company update operation" },
      { status: 500 },
    );
  }
}

export async function DELETE(request: Request, { params }: RouteParams) {
  try {
    const { id } = await params;

    if (!id) {
      return NextResponse.json(
        { error: "Missing company identifier parameter" },
        { status: 400 },
      );
    }

    await deleteCompanyFromSheets(id);

    return NextResponse.json(
      { message: `Company entry ${id} successfully removed` },
      { status: 200 },
    );
  } catch (error) {
    console.error(`[COMPANY_DELETE_ERROR] Failed purging row entry:`, error);
    return NextResponse.json(
      { error: "Internal Server Error during company deletion operation" },
      { status: 500 },
    );
  }
}
