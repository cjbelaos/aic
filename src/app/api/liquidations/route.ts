import { NextRequest, NextResponse } from "next/server";
import { requireAuthenticatedSession } from "@/lib/auth/session";
import {
  createLiquidation,
  getLiquidationsFullByUser,
} from "@/lib/liquidationSheets";
import type {
  NewLiquidationInput,
  ReceiptItemInput,
} from "@/types/liquidation";

/**
 * POST /api/liquidations
 * Creates a new expense liquidation batch.
 * UserId is captured server-side from the authenticated session.
 *
 * Body: { items: [{ date, description, category, amount, receiptImageUrl? }] }
 */
export async function POST(req: NextRequest) {
  const session = await requireAuthenticatedSession();
  if (session instanceof Response) return session;

  let body: NewLiquidationInput;
  try {
    body = (await req.json()) as NewLiquidationInput;
  } catch {
    return NextResponse.json(
      { error: "Invalid JSON body." },
      { status: 400 },
    );
  }

  const rawItems = body?.items;
  if (!Array.isArray(rawItems) || rawItems.length === 0) {
    return NextResponse.json(
      { error: "At least one receipt item is required." },
      { status: 400 },
    );
  }

  const items: ReceiptItemInput[] = rawItems.map((item) => ({
    date: (item.date || "").toString(),
    description: (item.description || "").toString(),
    category: (item.category || "").toString(),
    amount: Number(item.amount),
    receiptImageUrl: (item.receiptImageUrl || "").toString(),
  }));

  try {
    const result = await createLiquidation({
      userId: session.userId,
      items,
    });
    return NextResponse.json({
      success: true,
      liquidationId: result.liquidation.liquidationId,
      totalAmount: result.liquidation.totalAmount,
      itemCount: result.items.length,
    });
  } catch (error) {
    console.error("Liquidation create error:", error);
    return NextResponse.json(
      { error: (error as Error).message || "Failed to create liquidation." },
      { status: 400 },
    );
  }
}

/**
 * GET /api/liquidations
 * Returns the current user's liquidations with their receipt items.
 */
export async function GET() {
  const session = await requireAuthenticatedSession();
  if (session instanceof Response) return session;

  try {
    const liquidations = await getLiquidationsFullByUser(session.userId);
    // Sort newest first (most recently appended rows come last in the sheet,
    // so we reverse to show latest submissions on top).
    return NextResponse.json({
      success: true,
      liquidations: [...liquidations].reverse(),
    });
  } catch (error) {
    console.error("Liquidations list error:", error);
    return NextResponse.json(
      { error: "Failed to load liquidations." },
      { status: 500 },
    );
  }
}