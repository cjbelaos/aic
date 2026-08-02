import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";

export async function GET() {
  const session = await getSession();

  if (!session) {
    return NextResponse.json(
      { isSuccess: false, errorMessages: ["Not authenticated."] },
      { status: 401 },
    );
  }

  return NextResponse.json({
    isSuccess: true,
    result: {
      userId: session.userId,
      userName: session.username,
      userRoleId: session.userRoleId,
      departmentId: session.departmentId,
      positionId: session.positionId,
    },
  });
}
