import { NextRequest, NextResponse } from "next/server";
import { requireAuthenticatedSession } from "@/lib/auth/session";
import { getUsers } from "@/lib/userSheets";
import { getPositions } from "@/lib/positionSheets";
import { isExecutivePositionTitle } from "@/lib/positionUtils";
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
    const approvalType = searchParams.get("approvalType") || undefined;

    if (requesterUserId && departmentId) {
      const approver = await getApproverForRequester(
        requesterUserId,
        parseInt(departmentId, 10) || 0,
        approvalType,
      );
      return NextResponse.json(approver, { status: 200 });
    }

    const approvers = await getUserApprovers(approvalType);
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

    const requesterUserId = (body.requesterUserId || "").trim();
    const approverUserId = (body.approverUserId || "").trim();
    const approvalType = (body.approvalType || "").trim();

    if (!requesterUserId || !approverUserId) {
      return NextResponse.json(
        { error: "Requester and approver are required." },
        { status: 400 },
      );
    }
    if (requesterUserId === approverUserId) {
      return NextResponse.json(
        { error: "A user cannot be their own approver." },
        { status: 400 },
      );
    }
    if (
      approvalType &&
      approvalType !== "*" &&
      approvalType !== "FTI" &&
      approvalType !== "LIQUIDATION"
    ) {
      return NextResponse.json(
        { error: "approvalType must be one of: FTI, LIQUIDATION, or *." },
        { status: 400 },
      );
    }

    const users = await getUsers();
    const requester = users.find((u) => u.userId === requesterUserId);
    const approver = users.find((u) => u.userId === approverUserId);

    if (!requester) {
      return NextResponse.json(
        { error: "Requester user not found." },
        { status: 400 },
      );
    }
    if (!approver) {
      return NextResponse.json(
        { error: "Approver user not found." },
        { status: 400 },
      );
    }

    // Executive positions (General Manager, CFO, COO, CEO) may approve for
    // ANY requester regardless of department; everyone else must belong to
    // the requester's department.
    const positions = await getPositions();
    const executivePositionIds = new Set(
      positions
        .filter((p) => isExecutivePositionTitle(p.positionTitle))
        .map((p) => p.positionId),
    );
    const isExecutiveApprover = executivePositionIds.has(approver.positionId);

    const departmentId = Number(body.departmentId) || 0;
    if (requester.departmentId === 0) {
      return NextResponse.json(
        {
          error:
            "The requester has no department assigned. Assign a department to the requester first.",
        },
        { status: 400 },
      );
    }
    if (departmentId !== requester.departmentId) {
      return NextResponse.json(
        { error: "The department does not match the requester's department." },
        { status: 400 },
      );
    }
    if (!isExecutiveApprover && approver.departmentId !== requester.departmentId) {
      return NextResponse.json(
        {
          error:
            "Approver must be in the same department as the requester or hold an executive position (General Manager, CFO, COO, CEO).",
        },
        { status: 400 },
      );
    }

    const created = await addUserApprover({
      ...body,
      departmentId,
      requesterUserId,
      approverUserId,
      approvalType: approvalType || "*",
    });
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
