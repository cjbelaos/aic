import { NextRequest, NextResponse } from "next/server";
import { requireAuthenticatedSession } from "@/lib/auth/session";
import {
  addReceiptItemsV2,
  createLiquidationDraftV2,
  deleteLiquidationV2,
  getAllLiquidationsV2,
  getAllReceiptItemsV2,
  getLiquidationByIdV2,
  getLiquidationFullByControlNoForUserV2,
  getLiquidationsFullByUserV2,
  replaceReceiptItemsV2,
  updateLiquidationApprovalV2,
  updateLiquidationRequestedAmountV2,
  updateLiquidationStatusV2,
} from "@/lib/liquidationSheetsV2";
import { getUsers } from "@/lib/userSheets";
import { getUserApprovers } from "@/lib/userApproverSheets";
import type { LiquidationFullV2 } from "@/types/liquidation-v2";
import type { ReceiptItemV2Input } from "@/types/liquidation-v2";

/**
 * ISOLATED SANDBOX API — `/api/liquidation-v2`.
 * Mirrors the production `/api/liquidations` route but reads/writes the
 * dedicated `Liquidations_V2` / `ReceiptItems_V2` tabs. The production
 * `/api/liquidations` route is never touched.
 */

interface LiquidationV2ActionBody {
  action?: string;
  controlNo?: string;
  liquidationId?: string;
  items?: ReceiptItemV2Input[];
  totalAmountRequested?: number;
  approval?: {
    action: "approve" | "request_change" | "reject";
    comment?: string;
  };
}

export async function POST(req: NextRequest) {
  const session = await requireAuthenticatedSession();
  if (session instanceof Response) return session;

  let body: LiquidationV2ActionBody;
  try {
    body = (await req.json()) as LiquidationV2ActionBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const action = body.action || "create";

  try {
    // create → SAVED parent row in Liquidations_V2
    if (action === "create") {
      const controlNo = (body.controlNo || "").toString().trim();
      const liquidation = await createLiquidationDraftV2({
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

    // update → persist TotalAmountRequested
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
      await updateLiquidationRequestedAmountV2(liquidationId, amount);
      return NextResponse.json({ success: true, liquidationId });
    }

    // add-item → append to ReceiptItems_V2 + recompute TotalAmount
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
      const result = await addReceiptItemsV2(liquidationId, items);
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
      await replaceReceiptItemsV2(liquidationId, items);
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
      await updateLiquidationStatusV2(liquidationId, "SUBMITTED");
      return NextResponse.json({
        success: true,
        liquidationId,
        status: "SUBMITTED",
      });
    }

    // delete → remove liquidation + receipt items (owner only)
    if (action === "delete") {
      const liquidationId = (body.liquidationId || "").toString().trim();
      if (!liquidationId)
        return NextResponse.json(
          { error: "Missing required field: liquidationId." },
          { status: 400 },
        );
      await deleteLiquidationV2(liquidationId, session.userId);
      return NextResponse.json({ success: true, liquidationId });
    }

    // approve / request_change / reject (mirrors production permissions)
    if (action === "approve") {
      const liquidationId = (body.liquidationId || "").toString().trim();
      const approval = body.approval;
      if (!liquidationId || !approval)
        return NextResponse.json(
          { error: "Missing required fields: liquidationId, approval." },
          { status: 400 },
        );

      const liquidation = await getLiquidationByIdV2(liquidationId);
      if (!liquidation)
        return NextResponse.json(
          { error: "Liquidation not found." },
          { status: 404 },
        );

      const [approvers, users] = await Promise.all([
        getUserApprovers().catch(() => []),
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
      await updateLiquidationApprovalV2(
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
    console.error("Liquidation V2 action error:", error);
    return NextResponse.json(
      { error: (error as Error).message || "Failed to process liquidation." },
      { status: 400 },
    );
  }
}
export async function GET(req: NextRequest) {
  const session = await requireAuthenticatedSession();
  if (session instanceof Response) return session;

  // Deep-link support: ?controlNo=... returns just that user's liquidation.
  const controlNo = (req.nextUrl.searchParams.get("controlNo") || "")
    .toString()
    .trim();
  const adminUserId = (req.nextUrl.searchParams.get("userId") || "")
    .toString()
    .trim();
  if (controlNo) {
    try {
      const isAdmin = session.userRoleId === 1;
      const lookupUserId =
        isAdmin && adminUserId ? adminUserId : session.userId;
      const liquidation = await getLiquidationFullByControlNoForUserV2(
        lookupUserId,
        controlNo,
      );
      return NextResponse.json({
        success: true,
        liquidations: liquidation ? [liquidation] : [],
      });
    } catch (error) {
      console.error("Liquidation V2 by controlNo error:", error);
      return NextResponse.json(
        { error: "Failed to load liquidation." },
        { status: 500 },
      );
    }
  }

  const allParam = req.nextUrl.searchParams.get("all") === "true";
  const bodParam = req.nextUrl.searchParams.get("bod") === "true";

  try {
    const [mine, all, items, approvers, users] = await Promise.all([
      getLiquidationsFullByUserV2(session.userId),
      getAllLiquidationsV2(),
      getAllReceiptItemsV2(),
      getUserApprovers().catch(() => []),
      getUsers().catch(() => []),
    ]);

    const userNames = new Map<string, string>();
    const userDepts = new Map<string, number>();
    for (const u of users) {
      if (u.userId) {
        userNames.set(u.userId, u.fullName || u.userId);
        if (u.departmentId != null) userDepts.set(u.userId, u.departmentId);
      }
    }

    const attachItems = (l: (typeof all)[number]): LiquidationFullV2 => ({
      ...l,
      requesterName: userNames.get(l.userId) || "",
      requesterDepartmentId: userDepts.get(l.userId),
      items: items.filter((item) => item.liquidationId === l.liquidationId),
    });

    // Admin: return ALL V2 liquidations
    if (allParam && session.userRoleId === 1) {
      const allFull = all.map(attachItems);
      allFull.sort(
        (a, b) =>
          b.controlNo.localeCompare(a.controlNo) ||
          b.liquidationId.localeCompare(a.liquidationId),
      );
      return NextResponse.json({ success: true, liquidations: allFull });
    }

    // BOD: return all SUBMITTED V2 liquidations
    if (bodParam && session.departmentId === 4) {
      const submitted = all
        .filter((l) => (l.status || "").toUpperCase() === "SUBMITTED")
        .map(attachItems);
      submitted.sort(
        (a, b) =>
          b.controlNo.localeCompare(a.controlNo) ||
          b.liquidationId.localeCompare(a.liquidationId),
      );
      return NextResponse.json({ success: true, liquidations: submitted });
    }

    const mappedRequesterIds = new Set<string>();
    for (const m of approvers)
      if (m.approverUserId === session.userId)
        mappedRequesterIds.add(m.requesterUserId);

    const visible: LiquidationFullV2[] = mine.map((l) => ({
      ...l,
      requesterName: userNames.get(l.userId) || "",
    }));
    for (const liquidation of all) {
      const isApprover =
        liquidation.approvedByUserId === session.userId ||
        mappedRequesterIds.has(liquidation.userId);
      if (
        isApprover &&
        !visible.some((v) => v.liquidationId === liquidation.liquidationId)
      ) {
        visible.push(attachItems(liquidation));
      }
    }
    visible.sort(
      (a, b) =>
        b.controlNo.localeCompare(a.controlNo) ||
        b.liquidationId.localeCompare(a.liquidationId),
    );
    return NextResponse.json({ success: true, liquidations: visible });
  } catch (error) {
    console.error("Liquidation V2 list error:", error);
    return NextResponse.json(
      { error: "Failed to load liquidations." },
      { status: 500 },
    );
  }
}