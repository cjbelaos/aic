import { NextResponse } from "next/server";
import {
  updateCompanyInSheets,
  deleteCompanyFromSheets,
  getCompanies,
} from "@/lib/companySheets";
import {
  syncLocationNameFromCompany,
  detachCompanyFromLocations,
} from "@/lib/locationAddressSheets";
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

    // Propagate only the company NAME to the linked LocationAddresses row —
    // Address/Latitude/Longitude on the location are never overwritten.
    // Non-fatal if the sync fails (the company update itself already succeeded).
    if (updatedCompany?.companyId) {
      try {
        await syncLocationNameFromCompany({
          companyId: updatedCompany.companyId,
          companyName: updatedCompany.companyName,
        });
      } catch (err) {
        console.error(
          "[COMPANY_PUT] Location name sync failed (company still updated):",
          err,
        );
      }
    }

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

    // Resolve the CompanyId BEFORE removing the row so we can detach any
    // linked LocationAddresses afterwards (row stays; only the link clears).
    const companyId = (await getCompanies().catch(() => []))
      .find((c) => c.id === id)?.companyId || "";

    await deleteCompanyFromSheets(id);

    if (companyId) {
      try {
        await detachCompanyFromLocations(companyId);
      } catch (err) {
        console.error(
          "[COMPANY_DELETE] Location detach failed (company still deleted):",
          err,
        );
      }
    }

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
