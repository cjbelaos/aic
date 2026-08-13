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
import { getCompanies } from "@/lib/companySheets";
import { getSession } from "@/lib/auth/session";
import { getUsers } from "@/lib/userSheets";

export async function GET() {
  try {
    const session = await getSession();

    const [
      techList,
      miscellaneous,
      tollMatrixData,
      companies,
      locationAddresses,
      expresswayGroups,
      kmPerLiter,
    ] = await Promise.all([
      getTechnicians(),
      getMiscellaneous(),
      getTollMatrix(),
      getCompanies(),
      getLocationAddresses().catch(() => []),
      getExpresswayGroups(),
      getKmPerLiter(session?.userId || ""),
    ]);

    // Map to backward-compatible formats
    const technicians = techList.map((t) => t.fullName);
    const miscCodes = miscellaneous.map((m) => m.code);
    const locations = [
      ...companies.map((c) => ({
        companyName: c.companyName,
        address: c.address,
        locationId: c.companyId,
        latitude: c.latitude,
        longitude: c.longitude,
      })),
      ...locationAddresses.map((loc) => ({
        companyName: loc.locationName,
        address: loc.address,
        locationId: loc.locationId,
        latitude: loc.latitude,
        longitude: loc.longitude,
      })),
    ];
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
