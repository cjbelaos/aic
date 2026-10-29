import { NextRequest, NextResponse } from "next/server";
import { requireAuthenticatedSession } from "@/lib/auth/session";
import {
  addReceiptItems,
  createLiquidationDraft,
  deleteLiquidation,
  getAllLiquidations,
  getAllReceiptItems,
  getLiquidationById,
  getLiquidationFullByControlNoForUser,
  replaceReceiptItems,
  updateLiquidationApproval,
  updateLiquidationControlNo,
  updateLiquidationRequestedAmount,
  updateLiquidationStatus,
  withdrawLiquidation,
} from "@/lib/liquidationSheets";
import { enrichLiquidationAdvances } from "@/lib/liquidationReturnSheets";
import { getReturnAccess, withReturnAccess } from "@/lib/liquidation-return-access";
import { getUsers } from "@/lib/userSheets";
import { getUserApprovers } from "@/lib/userApproverSheets";
import type { ReceiptItemInput } from "@/types/liquidation";

interface LiquidationActionBody {
  action?: string;
  controlNo?: string;
  liquidationId?: string;
  items?: ReceiptItemInput[];
  totalAmountRequested?: number;
  force?: boolean;
  approval?: {
    action: "approve" | "request_change" | "reject";
    comment?: string;
  };
}

export async function POST(req: NextRequest) {
  const session = await requireAuthenticatedSession();
  if (session instanceof Response) return session;

  let body: LiquidationActionBody;
  try {
    body = (await req.json()) as LiquidationActionBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const action = body.action || "create";

  try {
    // create → SAVED parent row (ControlNo optional for "Other" liquidations)
    if (action === "create") {
      const controlNo = (body.controlNo || "").toString().trim();
      const liquidation = await createLiquidationDraft({
        userId: session.userId,
        controlNo,
        totalAmountRequested: body.totalAmountRequested,
      });
      return NextResponse.json({
        success: true,
        liquidationId: liquidation.liquidationId,
        status: liquidation.status,
        totalAmountRequested: liquidation.totalAmountRequested,
      });
    }

    // update → persist TotalAmountRequested (manual amount for "Other")
    if (action === "update") {
      const liquidationId = (body.liquidationId || "").toString().trim();
      if (!liquidationId)
        return NextResponse.json(
          { error: "Missing required field: liquidationId." },
          { status: 400 },
        );
      const amount = Number(body.totalAmountRequested);
      if (isNaN(amount) || amount < 0)
        return NextResponse.json(
          { error: "totalAmountRequested must be a non-negative number." },
          { status: 400 },
        );
      await updateLiquidationRequestedAmount(
        liquidationId,
        amount,
        session.userId,
      );
      return NextResponse.json({ success: true, liquidationId });
    }

    // add-item → append to ReceiptItems + recompute TotalAmount
    if (action === "add-item") {
      const liquidationId = (body.liquidationId || "").toString().trim();
      const items = body.items;
      if (!liquidationId)
        return NextResponse.json(
          { error: "Missing required field: liquidationId." },
          { status: 400 },
        );
      if (!Array.isArray(items) || items.length === 0)
        return NextResponse.json(
          { error: "At least one receipt item is required." },
          { status: 400 },
        );
      const result = await addReceiptItems(liquidationId, items, session.userId);
      return NextResponse.json({
        success: true,
        liquidationId: result.liquidation.liquidationId,
        status: result.liquidation.status,
        totalAmount: result.liquidation.totalAmount,
        itemCount: result.added.length,
      });
    }

    // replace → overwrite all receipt items (edit/delete persistence)
    if (action === "replace") {
      const liquidationId = (body.liquidationId || "").toString().trim();
      const items = body.items || [];
      if (!liquidationId) {
        return NextResponse.json(
          { error: "Missing required field: liquidationId." },
          { status: 400 },
        );
      }
      await replaceReceiptItems(liquidationId, items, session.userId);
      return NextResponse.json({
        success: true,
        liquidationId,
        status: "SAVED",
      });
    }

    // submit → Status=SUBMITTED + auto-assign approver
    if (action === "submit") {
      const liquidationId = (body.liquidationId || "").toString().trim();
      if (!liquidationId)
        return NextResponse.json(
          { error: "Missing required field: liquidationId." },
          { status: 400 },
        );
      await updateLiquidationStatus(liquidationId, "SUBMITTED", session.userId);
      return NextResponse.json({
        success: true,
        liquidationId,
        status: "SUBMITTED",
      });
    }

    // update-controlno → change the FTI linkage on an existing liquidation
    if (action === "update-controlno") {
      const liquidationId = (body.liquidationId || "").toString().trim();
      const newControlNo = (body.controlNo || "").toString().trim();
      if (!liquidationId)
        return NextResponse.json(
          { error: "Missing required field: liquidationId." },
          { status: 400 },
        );
      await updateLiquidationControlNo(
        liquidationId,
        newControlNo,
        session.userId,
      );
      return NextResponse.json({
        success: true,
        liquidationId,
        controlNo: newControlNo,
      });
    }

    // delete → remove liquidation + receipt items (owner only, SAVED or REQUESTED_FOR_CHANGE)
    if (action === "delete") {
      const liquidationId = (body.liquidationId || "").toString().trim();
      if (!liquidationId)
        return NextResponse.json(
          { error: "Missing required field: liquidationId." },
          { status: 400 },
        );
      await deleteLiquidation(liquidationId, session.userId);
      return NextResponse.json({ success: true, liquidationId });
    }

    // withdraw → pull back to SAVED (self-service or admin force)
    if (action === "withdraw") {
      const liquidationId = (body.liquidationId || "").toString().trim();
      if (!liquidationId)
        return NextResponse.json(
          { error: "Missing required field: liquidationId." },
          { status: 400 },
        );
      const isAdmin = session.userRoleId === 1;
      await withdrawLiquidation(liquidationId, session.userId, body.force === true || isAdmin);
      return NextResponse.json({
        success: true,
        liquidationId,
        status: "SAVED",
      });
    }

    // withdraw → pull back to SAVED (self-service or admin force)
    if (action === "withdraw") {
      const liquidationId = (body.liquidationId || "").toString().trim();
      if (!liquidationId)
        return NextResponse.json(
          { error: "Missing required field: liquidationId." },
          { status: 400 },
        );
      const isAdmin = session.userRoleId === 1;
      await withdrawLiquidation(liquidationId, session.userId, body.force === true || isAdmin);
      return NextResponse.json({
        success: true,
        liquidationId,
        status: "SAVED",
      });
    }

    // approve / request_change / reject
    if (action === "approve") {
      const liquidationId = (body.liquidationId || "").toString().trim();
      const approval = body.approval;
      if (!liquidationId || !approval)
        return NextResponse.json(
          { error: "Missing required fields: liquidationId, approval." },
          { status: 400 },
        );

      const liquidation = await getLiquidationById(liquidationId);
      if (!liquidation)
        return NextResponse.json(
          { error: "Liquidation not found." },
          { status: 404 },
        );

      const [approvers, users] = await Promise.all([
        getUserApprovers("LIQUIDATION").catch(() => []),
        getUsers().catch(() => []),
      ]);
      const mapped = approvers.some(
        (m) =>
          m.approverUserId === session.userId &&
          m.requesterUserId === liquidation.userId,
      );
      const isAssignedApprover =
        liquidation.approvedByUserId === session.userId;
      // BOD (departmentId === 4) can approve any SUBMITTED liquidation
      const isBod = session.departmentId === 4;
      if (!isAssignedApprover && !mapped && !isBod)
        return NextResponse.json(
          {
            error: "Forbidden. You are not the approver for this liquidation.",
          },
          { status: 403 },
        );

      const approverUser = users.find((u) => u.userId === session.userId);
      const isApprove = (approval.action || "").toUpperCase() === "APPROVE";
      // Convert the raw Drive fileId to a proxy image URL that can render in
      // the browser and in html2canvas. The sheet stores the raw fileId but
      // we persist the proxied URL for the preview/print document.
      const signatureUrl =
        isApprove && approverUser?.signature
          ? `/api/images/drive/${approverUser.signature}`
          : "";
      await updateLiquidationApproval(
        liquidationId,
        approval.action,
        session.userId,
        approverUser?.fullName,
        signatureUrl,
        approval.comment,
      );

      const status =
        approval.action === "approve"
          ? "APPROVED"
          : approval.action === "request_change"
            ? "REQUESTED_FOR_CHANGE"
            : "REJECTED";
      return NextResponse.json({ success: true, liquidationId, status });
    }

    return NextResponse.json(
      { error: `Unknown action: ${action}` },
      { status: 400 },
    );
  } catch (error) {
    console.error("Liquidation action error:", error);
    return NextResponse.json(
      { error: (error as Error).message || "Failed to process liquidation." },
      { status: 400 },
    );
  }
}

export async function GET(req: NextRequest) {
  const session = await requireAuthenticatedSession();
  if (session instanceof Response) return session;

  // Deep-link support: ?controlNo=CTRL-... returns just that user's
  // liquidation (with receipt items) so the form can restore existing
  // receipts when an FTI is re-selected.
  const controlNo = (req.nextUrl.searchParams.get("controlNo") || "")
    .toString()
    .trim();
  const adminUserId = (req.nextUrl.searchParams.get("userId") || "")
    .toString()
    .trim();
  if (controlNo) {
    try {
      const isAdmin = session.userRoleId === 1;
      // Admin can view any user's liquidation by passing ?userId=...
      const lookupUserId =
        isAdmin && adminUserId ? adminUserId : session.userId;
      let liquidation = await getLiquidationFullByControlNoForUser(
        lookupUserId,
        controlNo,
      );
      if (liquidation) {
        const enriched = await enrichLiquidationAdvances([liquidation]);
        liquidation = withReturnAccess(enriched[0], await getReturnAccess(session));
      }
      return NextResponse.json({
        success: true,
        liquidations: liquidation ? [liquidation] : [],
      });
    } catch (error) {
      console.error("Liquidation by controlNo error:", error);
      return NextResponse.json(
        { error: "Failed to load liquidation." },
        { status: 500 },
      );
    }
  }

  const bodParam = req.nextUrl.searchParams.get("bod") === "true";
  try {
    const [all, items, users, access] = await Promise.all([
      getAllLiquidations(), getAllReceiptItems(), getUsers(), getReturnAccess(session),
    ]);
    const userNames = new Map(users.map(u => [u.userId, u.fullName || u.userId]));
    const userDepts = new Map(users.map(u => [u.userId, u.departmentId]));
    const visible = all.filter(l =>
      access.isAdmin || l.userId === session.userId || l.approvedByUserId === session.userId ||
      access.requesterIds.has(l.userId) ||
      (access.isCfo && l.status.toUpperCase() === "APPROVED") ||
      (bodParam && session.departmentId === 4 && l.status.toUpperCase() === "SUBMITTED"),
    ).map(l => ({
      ...l, requesterName: userNames.get(l.userId) || "",
      requesterDepartmentId: userDepts.get(l.userId),
      items: items.filter(item => item.liquidationId === l.liquidationId),
    }));
    visible.sort((a, b) => b.controlNo.localeCompare(a.controlNo));
    const enriched = await enrichLiquidationAdvances(visible);
    return NextResponse.json({ success: true, liquidations: enriched.map(l => withReturnAccess(l, access)) },
      { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    console.error("Liquidations list error:", error);
    return NextResponse.json(
      { error: "Failed to load liquidations." },
      { status: 500 },
    );
  }
}
