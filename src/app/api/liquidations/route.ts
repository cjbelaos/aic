import { NextRequest, NextResponse } from "next/server";
import { requireAuthenticatedSession } from "@/lib/auth/session";
import {
  addReceiptItems,
  createLiquidationDraft,
  getAllLiquidations,
  getAllReceiptItems,
  getLiquidationById,
  getLiquidationFullByControlNoForUser,
  getLiquidationsFullByUser,
  replaceReceiptItems,
  updateLiquidationApproval,
  updateLiquidationRequestedAmount,
  updateLiquidationStatus,
} from "@/lib/liquidationSheets";
import { getUsers } from "@/lib/userSheets";
import { getUserApprovers } from "@/lib/userApproverSheets";
import type { ReceiptItemInput } from "@/types/liquidation";

interface LiquidationActionBody {
  action?: string;
  controlNo?: string;
  liquidationId?: string;
  items?: ReceiptItemInput[];
  totalAmountRequested?: number;
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
      await updateLiquidationRequestedAmount(liquidationId, amount);
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
      const result = await addReceiptItems(liquidationId, items);
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
      await replaceReceiptItems(liquidationId, items);
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
      await updateLiquidationStatus(liquidationId, "SUBMITTED");
      return NextResponse.json({
        success: true,
        liquidationId,
        status: "SUBMITTED",
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
      await updateLiquidationApproval(
        liquidationId,
        approval.action,
        session.userId,
        approverUser?.fullName,
        approverUser?.signature,
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
  if (controlNo) {
    try {
      const liquidation = await getLiquidationFullByControlNoForUser(
        session.userId,
        controlNo,
      );
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

  // ?all=true — Admin (userRoleId === 1) sees ALL liquidations
  const allParam = req.nextUrl.searchParams.get("all") === "true";
  // ?bod=true — BOD (departmentId === 4) sees all SUBMITTED liquidations
  const bodParam = req.nextUrl.searchParams.get("bod") === "true";

  try {
    const [mine, all, items, approvers, users] = await Promise.all([
      getLiquidationsFullByUser(session.userId),
      getAllLiquidations(),
      getAllReceiptItems(),
      getUserApprovers().catch(() => []),
      import("@/lib/userSheets").then((m) => m.getUsers()).catch(() => []),
    ]);

    // Build a userId → fullName map for display
    const userNames = new Map<string, string>();
    for (const u of users) {
      if (u.userId) userNames.set(u.userId, u.fullName || u.userId);
    }

    // Admin: return ALL liquidations
    if (allParam && session.userRoleId === 1) {
      const allFull = all.map((liquidation) => ({
        ...liquidation,
        requesterName: userNames.get(liquidation.userId) || "",
        items: items.filter(
          (item) => item.liquidationId === liquidation.liquidationId,
        ),
      }));
      allFull.sort((a, b) => b.controlNo.localeCompare(a.controlNo));
      return NextResponse.json({ success: true, liquidations: allFull });
    }

    // BOD: return all SUBMITTED liquidations
    if (bodParam && session.departmentId === 4) {
      const submitted = all
        .filter((l) => (l.status || "").toUpperCase() === "SUBMITTED")
        .map((liquidation) => ({
          ...liquidation,
          requesterName: userNames.get(liquidation.userId) || "",
          items: items.filter(
            (item) => item.liquidationId === liquidation.liquidationId,
          ),
        }));
      submitted.sort((a, b) => b.controlNo.localeCompare(a.controlNo));
      return NextResponse.json({ success: true, liquidations: submitted });
    }

    const mappedRequesterIds = new Set<string>();
    for (const m of approvers)
      if (m.approverUserId === session.userId)
        mappedRequesterIds.add(m.requesterUserId);

    const visible = [...mine];
    for (const liquidation of all) {
      const isApprover =
        liquidation.approvedByUserId === session.userId ||
        mappedRequesterIds.has(liquidation.userId);
      if (
        isApprover &&
        !visible.some((v) => v.liquidationId === liquidation.liquidationId)
      ) {
        visible.push({
          ...liquidation,
          requesterName: userNames.get(liquidation.userId) || "",
          items: items.filter(
            (item) => item.liquidationId === liquidation.liquidationId,
          ),
        });
      }
    }
    visible.sort((a, b) => b.controlNo.localeCompare(a.controlNo));
    return NextResponse.json({ success: true, liquidations: visible });
  } catch (error) {
    console.error("Liquidations list error:", error);
    return NextResponse.json(
      { error: "Failed to load liquidations." },
      { status: 500 },
    );
  }
}
