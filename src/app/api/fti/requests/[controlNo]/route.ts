import { NextRequest, NextResponse } from "next/server";
import {
  getFTIRequestFull,
  deleteFTIRequest,
  updateFTIRequestStatus,
  updateFTIFileLink,
  saveFullFTIRequest,
} from "@/lib/ftiSheets";
import { getSession } from "@/lib/auth/session";
import type { FTIDetailInput } from "@/types/fti";

type RouteContext = { params: Promise<{ controlNo: string }> };

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
    if (!isAdmin && full.userId !== session.userId) {
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
      if (!isAdmin && full.userId !== session.userId) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }
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
