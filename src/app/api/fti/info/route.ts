import { NextResponse } from "next/server";
import {
  getTechnicians,
  getMiscellaneous,
  getTollMatrix,
  getExpresswayGroups,
  generateFTIRef,
  getKmPerLiter,
} from "@/lib/ftiSheets";
import { getLocationAddresses } from "@/lib/locationAddressSheets";
import { getSession } from "@/lib/auth/session";
import { getUsers } from "@/lib/userSheets";

export async function GET() {
  try {
    const session = await getSession();

    const [
      techList,
      miscellaneous,
      tollMatrixData,
      locationAddresses,
      expresswayGroups,
      kmPerLiter,
    ] = await Promise.all([
      getTechnicians(),
      getMiscellaneous(),
      getTollMatrix(),
      getLocationAddresses().catch(() => []),
      getExpresswayGroups(),
      getKmPerLiter(session?.userId || ""),
    ]);

    // Map to backward-compatible formats
    const technicians = techList.map((t) => t.fullName);
    const miscCodes = miscellaneous.map((m) => m.code);
    // FTI origins/destinations come ONLY from LocationAddresses (which already
    // mirrors Companies when a row has a CompanyId). Companies' Address is the
    // billing address used on printed documents, not the Google-Maps address
    // FTI needs, so companies are intentionally excluded here. Distance is computed
    // from the address string (coordinates are used when present, otherwise the
    // address is sent), so the full location list is exposed — status is NOT a
    // hard filter here; it is surfaced mainly on the Location Addresses page.
    const locations = locationAddresses.map((loc) => ({
      companyName: loc.locationName,
      address: loc.address,
      locationId: loc.locationId,
      latitude: loc.latitude,
      longitude: loc.longitude,
      status: loc.status,
    }));
    const tollGates = tollMatrixData.gates || [];

    // Get current user's fullName + role + user list for the admin dropdown.
    let currentUserFullName = "";
    if (session) {
      currentUserFullName = session.fullName;
    }
    const isAdmin = session?.userRoleId === 1;
    const users = await getUsers().catch(() => []);

    return NextResponse.json({
      technicians,
      miscellaneous: miscCodes,
      miscellaneousFull: miscellaneous.map((m) => ({
        code: m.code,
        description: m.description,
      })),
      tollGates,
      tollMatrix: {
        gates: tollMatrixData.gates,
        matrix: tollMatrixData.matrix,
      },
      locations,
      expresswayGroups,
      currentUserFullName,
      currentUserUsername: session?.username || "",
      currentUserId: session?.userId || "",
      isAdmin,
      users: users.map((u) => ({ userId: u.userId, fullName: u.fullName })),
      ftiRef: generateFTIRef(),
      kmPerLiter,
    });
  } catch (error) {
    console.error("FTI info fetch error:", error);
    return NextResponse.json(
      { error: "Failed to load form data" },
      { status: 500 },
    );
  }
}
