import { NextRequest, NextResponse } from "next/server";
import {
  getFTIRequestFull,
  deleteFTIRequest,
  updateFTIRequestStatus,
  updateFTIFileLink,
  updateFTIApproval,
  saveFullFTIRequest,
} from "@/lib/ftiSheets";
import { getUserApprovers } from "@/lib/userApproverSheets";
import { getSession } from "@/lib/auth/session";
import type { FTIDetailInput } from "@/types/fti";

type RouteContext = { params: Promise<{ controlNo: string }> };

/**
 * Returns true when the session user is authorized to approve the given
 * request: admin, the request's stored approver (column G), or a mapped
 * approver from the UserApprovers sheet for the requester.
 */
async function isAuthorizedApprover(
  sessionUserId: string,
  isAdmin: boolean,
  full: { userId: string; approvedByUserId?: string },
): Promise<boolean> {
  if (isAdmin) return true;
  if (full.approvedByUserId === sessionUserId) return true;
  try {
    const approvers = await getUserApprovers("FTI");
    return approvers.some(
      (m) =>
        m.approverUserId === sessionUserId && m.requesterUserId === full.userId,
    );
  } catch {
    return false;
  }
}

export async function GET(_req: NextRequest, context: RouteContext) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json(
        { error: "Authentication required." },
        { status: 401 },
      );
    }

    const { controlNo } = await context.params;
    const full = await getFTIRequestFull(decodeURIComponent(controlNo));
    if (!full) {
      return NextResponse.json({ error: "Request not found" }, { status: 404 });
    }

    const isAdmin = session.userRoleId === 1;
    const isApprover = await isAuthorizedApprover(
      session.userId,
      isAdmin,
      full,
    );
    if (!isAdmin && full.userId !== session.userId && !isApprover) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    return NextResponse.json(full);
  } catch (error) {
    console.error("FTI request fetch error:", error);
    return NextResponse.json(
      { error: "Failed to load FTI request" },
      { status: 500 },
    );
  }
}

export async function PATCH(req: NextRequest, context: RouteContext) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json(
        { error: "Authentication required." },
        { status: 401 },
      );
    }

    const { controlNo } = await context.params;
    const decoded = decodeURIComponent(controlNo);
    const body = await req.json();

    // A draft may not exist in the sheet yet (memory-stage). Only enforce
    // permission when the request already exists.
    const full = await getFTIRequestFull(decoded);
    if (full) {
      const isAdmin = session.userRoleId === 1;
      const isApprover = await isAuthorizedApprover(
        session.userId,
        isAdmin,
        full,
      );
      if (!isAdmin && full.userId !== session.userId && !isApprover) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }
    }

    // ── Approval actions (approver flow) ──
    if (body.action) {
      if (!full) {
        return NextResponse.json(
          { error: "Request not found" },
          { status: 404 },
        );
      }
      const isAdmin = session.userRoleId === 1;
      const isApprover = await isAuthorizedApprover(
        session.userId,
        isAdmin,
        full,
      );
      if (!isApprover) {
        return NextResponse.json(
          { error: "Only the assigned approver can decide this request." },
          { status: 403 },
        );
      }
      if (full.status.toUpperCase() !== "SENT") {
        return NextResponse.json(
          { error: `Cannot act on request with status "${full.status}".` },
          { status: 400 },
        );
      }
      const { action, comment, ftiFileLink } = body as {
        action: "approve" | "request_change" | "reject";
        comment?: string;
        ftiFileLink?: string;
      };
      await updateFTIApproval(
        decoded,
        action,
        session.userId,
        body.approvedByName,
        body.approvedBySignatureUrl,
        comment,
      );
      // Persist the signed PDF Google Drive link (approval only).
      if (action === "approve" && ftiFileLink) {
        await updateFTIFileLink(decoded, ftiFileLink);
      }
      const updated = await getFTIRequestFull(decoded);
      return NextResponse.json(updated);
    }

    if (body.details && Array.isArray(body.details)) {
      const status = body.status || full?.status || "DRAFT";
      // First save: this creates the FTIRequests row with the session user.
      await saveFullFTIRequest(
        decoded,
        status,
        body.details as FTIDetailInput[],
        session.userId,
      );
      // Persist the Google Drive PDF link (sent requests).
      if (body.ftiFileLink) {
        await updateFTIFileLink(decoded, body.ftiFileLink);
      }
    } else if (body.status) {
      if (!full) {
        return NextResponse.json(
          { error: "Request not found" },
          { status: 404 },
        );
      }
      await updateFTIRequestStatus(decoded, body.status);
    }

    const updated = await getFTIRequestFull(decoded);
    return NextResponse.json(updated);
  } catch (error) {
    console.error("FTI request update error:", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Failed to update FTI request",
      },
      { status: 500 },
    );
  }
}

export async function DELETE(_req: NextRequest, context: RouteContext) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json(
        { error: "Authentication required." },
        { status: 401 },
      );
    }

    const { controlNo } = await context.params;
    const decoded = decodeURIComponent(controlNo);

    const full = await getFTIRequestFull(decoded);
    if (!full) {
      return NextResponse.json({ error: "Request not found" }, { status: 404 });
    }

    const isAdmin = session.userRoleId === 1;
    if (!isAdmin && full.userId !== session.userId) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }

    await deleteFTIRequest(decoded);
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("FTI request delete error:", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Failed to delete FTI request",
      },
      { status: 500 },
    );
  }
}
