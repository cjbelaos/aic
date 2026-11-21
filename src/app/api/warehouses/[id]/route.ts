import { NextResponse } from "next/server";
import { requireAuthenticatedSession } from "@/lib/auth/session";
import { setWarehouseActive, updateWarehouse, WarehouseValidationError } from "@/lib/warehouseSheets";
import { toWarehouseInput } from "@/lib/warehouseRules";

type Context = { params: Promise<{ id: string }> };

function failure(error: unknown, fallback: string) {
  const status = error instanceof WarehouseValidationError ? 422 : 500;
  return NextResponse.json({ error: error instanceof Error ? error.message : fallback }, { status });
}

/** Edits a warehouse's details. Its ID, company and active flag are not changed here. */
export async function PUT(request: Request, context: Context) {
  const session = await requireAuthenticatedSession();
  if (session instanceof Response) return session;
  try {
    const { id } = await context.params;
    return NextResponse.json(await updateWarehouse(id, toWarehouseInput(await request.json()), session.userId));
  } catch (error) {
    return failure(error, "Failed to update warehouse.");
  }
}

/** Reactivates (or deactivates) a warehouse: `{ active: boolean }`. */
export async function PATCH(request: Request, context: Context) {
  const session = await requireAuthenticatedSession();
  if (session instanceof Response) return session;
  try {
    const { id } = await context.params;
    const body = (await request.json()) as { active?: unknown };
    if (typeof body.active !== "boolean") return NextResponse.json({ error: "active must be true or false." }, { status: 400 });
    return NextResponse.json(await setWarehouseActive(id, body.active, session.userId));
  } catch (error) {
    return failure(error, "Failed to update warehouse.");
  }
}

/** Deactivates a warehouse. Rows are never removed: stock, DRs and Purchase Orders reference them. */
export async function DELETE(_request: Request, context: Context) {
  const session = await requireAuthenticatedSession();
  if (session instanceof Response) return session;
  try {
    const { id } = await context.params;
    return NextResponse.json(await setWarehouseActive(id, false, session.userId));
  } catch (error) {
    return failure(error, "Failed to deactivate warehouse.");
  }
}
