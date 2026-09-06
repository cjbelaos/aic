import { NextRequest, NextResponse } from "next/server";
import { requireAuthenticatedSession } from "@/lib/auth/session";
import { getUsers } from "@/lib/userSheets";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await requireAuthenticatedSession();
  if (session instanceof Response) return session;

  try {
    const { id } = await params;
    const departmentId = parseInt(id, 10);
    if (isNaN(departmentId)) {
      return NextResponse.json(
        { error: "Invalid department ID." },
        { status: 400 },
      );
    }

    const users = await getUsers();
    const departmentUsers = users.filter(
      (u) => u.departmentId === departmentId,
    );

    return NextResponse.json(departmentUsers, { status: 200 });
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Failed to fetch department users.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
