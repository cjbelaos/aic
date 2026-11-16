import { after, NextRequest, NextResponse } from "next/server";
import { withFTIWriteLock, FTIWriteConflict } from "@/lib/ftiWriteLock";
import { processFTIPdfJobs } from "@/lib/ftiPdfJobs";
import { getUserById } from "@/lib/userSheets";
import {
  getFTIRequestFull,
  deleteFTIRequest,
  updateFTIRequestStatus,
  updateFTIApproval,
  saveFullFTIRequest,
  withdrawFTIRequest,
  FTIApproverRequiredError,
} from "@/lib/ftiSheets";
import { getUserApprovers } from "@/lib/userApproverSheets";
import { getSession } from "@/lib/auth/session";
import type { FTIDetailInput } from "@/types/fti";
import { isEditableStatus } from "@/types/fti";

type RouteContext = { params: Promise<{ controlNo: string }> };
export const maxDuration = 60;

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
    const full = await getFTIRequestFull(decodeURIComponent(controlNo), true);
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
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  try {
    const response = await withFTIWriteLock(() => patchRequest(req, context));
    if (response.ok) after(() => processFTIPdfJobs().catch(() => undefined));
    return response;
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Failed to update FTI." }, { status: error instanceof FTIWriteConflict ? 409 : 500 });
  }
}

async function patchRequest(req: NextRequest, context: RouteContext) {
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

    // Only administrators may reopen a submitted request.
    if (body.action === "withdraw") {
      if (!full) {
        return NextResponse.json({ error: "Request not found" }, { status: 404 });
      }
      if (session.userRoleId !== 1) {
        return NextResponse.json(
          { error: "Submitted FTI requests are read-only." },
          { status: 403 },
        );
      }
      await withdrawFTIRequest(decoded, session.userId, body.force === true);
      return NextResponse.json(await getFTIRequestFull(decoded));
    }

    // Approval actions remain available to authorized approvers.
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
      if (!["SENT", "SUBMITTED"].includes(full.status.toUpperCase())) {
        return NextResponse.json(
          { error: `Cannot act on request with status "${full.status}".` },
          { status: 400 },
        );
      }
      if (!["approve", "request_change", "reject"].includes(body.action)) {
        return NextResponse.json({ error: "Invalid approval action." }, { status: 400 });
      }
      if (body.action === "approve" && (!body.expectedRevision || body.expectedRevision !== full.revision)) {
        return NextResponse.json({ error: "This FTI has changed. Review the refreshed amounts before approving.", code: "FTI_CHANGED" }, { status: 409 });
      }
      const { action, comment } = body as {
        action: "approve" | "request_change" | "reject";
        comment?: string;
      };
      const approver = await getUserById(session.userId);
      await updateFTIApproval(
        decoded,
        action,
        session.userId,
        approver?.fullName || session.username,
        approver?.signature ? `/api/images/drive/${approver.signature}` : "",
        comment,
      );
      const updated = await getFTIRequestFull(decoded);
      return NextResponse.json(updated);
    }

    if (full && !isEditableStatus(full.status)) {
      return NextResponse.json(
        { error: "Submitted FTI requests are read-only." },
        { status: 403 },
      );
    }

    if (body.ftiFileLink || (body.status && !["DRAFT", "SENT", "SUBMITTED"].includes(body.status))) {
      return NextResponse.json({ error: "Use the FTI approval or PDF regeneration action." }, { status: 400 });
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
      { status: error instanceof FTIApproverRequiredError ? 422 : 500 },
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

    if (!isEditableStatus(full.status)) {
      return NextResponse.json(
        { error: "Submitted FTI requests cannot be deleted." },
        { status: 403 },
      );
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
