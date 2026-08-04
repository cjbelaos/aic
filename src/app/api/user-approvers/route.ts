import { NextRequest, NextResponse } from "next/server";
import { requireAuthenticatedSession } from "@/lib/auth/session";
import {
  getUserApprovers,
  getApproverForRequester,
  addUserApprover,
  deleteUserApprover,
} from "@/lib/userApproverSheets";
import type { UserApprover } from "@/types/userApprover";

export async function GET(req: NextRequest) {
  const session = await requireAuthenticatedSession();
  if (session instanceof Response) return session;

  try {
    const { searchParams } = new URL(req.url);
    const requesterUserId = searchParams.get("requesterUserId");
    const departmentId = searchParams.get("departmentId");

    if (requesterUserId && departmentId) {
      const approver = await getApproverForRequester(
        requesterUserId,
        parseInt(departmentId, 10) || 0,
      );
      return NextResponse.json(approver, { status: 200 });
    }

    const approvers = await getUserApprovers();
    return NextResponse.json(approvers, { status: 200 });
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Failed to fetch user-approver mappings.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const session = await requireAuthenticatedSession();
  if (session instanceof Response) return session;

  try {
    const body: UserApprover = await request.json();
    const created = await addUserApprover(body);
    return NextResponse.json(created, { status: 201 });
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Failed to create user-approver mapping.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  const session = await requireAuthenticatedSession();
  if (session instanceof Response) return session;

  try {
    const { searchParams } = new URL(request.url);
    const configId = searchParams.get("configId");
    if (!configId) {
      return NextResponse.json(
        { error: "configId query parameter is required." },
        { status: 400 },
      );
    }
    await deleteUserApprover(configId);
    return NextResponse.json({ success: true }, { status: 200 });
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Failed to delete user-approver mapping.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
