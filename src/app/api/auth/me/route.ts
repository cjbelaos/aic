import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { isSuperAdmin } from "@/lib/auth/superAdmin";
import { getUserById } from "@/lib/userSheets";

export async function GET() {
  const session = await getSession();

  if (!session) {
    return NextResponse.json(
      { isSuccess: false, errorMessages: ["Not authenticated."] },
      { status: 401 },
    );
  }

  const fullName = session.fullName?.trim() || (await getUserById(session.userId))?.fullName || "";

  return NextResponse.json({
    isSuccess: true,
    result: {
      userId: session.userId,
      userName: session.username,
      fullName,
      userRoleId: session.userRoleId,
      departmentId: session.departmentId,
      positionId: session.positionId,
      isSuperAdmin: isSuperAdmin(session),
    },
  });
}
