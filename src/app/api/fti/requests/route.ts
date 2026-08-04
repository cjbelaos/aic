import { NextRequest, NextResponse } from "next/server";
import { getAllFTIRequests, createFTIRequest } from "@/lib/ftiSheets";
import { getUsers } from "@/lib/userSheets";
import { getUserApprovers } from "@/lib/userApproverSheets";
import { getSession } from "@/lib/auth/session";
import type { FTIRequestSummary } from "@/types/fti";

export async function GET(request: NextRequest) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json(
        { error: "Authentication required." },
        { status: 401 },
      );
    }

    const { searchParams } = new URL(request.url);
    const userIdFilter = searchParams.get("userId");

    // If userId param is provided, only admins can view others; regular users see only themselves
    if (userIdFilter) {
      const isAdmin = session.userRoleId === 1;
      if (!isAdmin && session.userId !== userIdFilter) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }
    }

    const [requests, users, approvers] = await Promise.all([
      getAllFTIRequests(),
      getUsers(),
      getUserApprovers().catch(() => []),
    ]);

    const userMap = new Map(users.map((u) => [u.userId, u.fullName]));
    const isAdmin = session.userRoleId === 1;

    // Build a set of requester user IDs for which the current user is an approver
    // (from the UserApprovers sheet — the source of truth for who may approve whom).
    const mappedRequesterIds = new Set<string>();
    for (const m of approvers) {
      if (m.approverUserId === session.userId) {
        mappedRequesterIds.add(m.requesterUserId);
      }
    }

    const filtered = userIdFilter
      ? requests.filter((r) => r.userId === userIdFilter)
      : isAdmin
        ? requests
        : requests.filter(
            (r) =>
              r.userId === session.userId ||
              r.approverUserId === session.userId ||
              mappedRequesterIds.has(r.userId),
          );

    const sorted = [...filtered].sort((x, y) =>
      (y.dateCreated || "").localeCompare(x.dateCreated || ""),
    );
    const summaries: FTIRequestSummary[] = sorted.map((req) => ({
      ...req,
      userName: userMap.get(req.userId) || req.userId,
      totalAmount: req.totalAmount ?? 0,
    }));
    return NextResponse.json(summaries);
  } catch (error) {
    console.error("FTI requests fetch error:", error);
    return NextResponse.json(
      { error: "Failed to load FTI requests" },
      { status: 500 },
    );
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json(
        { error: "Authentication required." },
        { status: 401 },
      );
    }

    const body = await req.json().catch(() => ({}));
    const userId = (body.userId as string) || session.userId;
    const request = await createFTIRequest(userId);

    return NextResponse.json(request, { status: 201 });
  } catch (error) {
    console.error("FTI request create error:", error);
    return NextResponse.json(
      { error: "Failed to create FTI request" },
      { status: 500 },
    );
  }
}
