import { NextResponse } from "next/server";
import { requireAuthenticatedSession } from "@/lib/auth/session";
import { addWarehouse, getWarehouses, WarehouseValidationError } from "@/lib/warehouseSheets";
import { toWarehouseInput } from "@/lib/warehouseRules";
import type { WarehouseInput } from "@/types/warehouse";

export async function GET() {
  const session = await requireAuthenticatedSession();
  if (session instanceof Response) return session;
  try {
    return NextResponse.json(await getWarehouses());
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Failed to load warehouses." }, { status: 500 });
  }
}

/** Creates a warehouse. The Warehouse ID is assigned by the server; any ID in the body is ignored. */
export async function POST(request: Request) {
  const session = await requireAuthenticatedSession();
  if (session instanceof Response) return session;
  try {
    const body = (await request.json()) as Partial<WarehouseInput>;
    return NextResponse.json(await addWarehouse(toWarehouseInput(body), session.userId), { status: 201 });
  } catch (error) {
    const status = error instanceof WarehouseValidationError ? 422 : 500;
    return NextResponse.json({ error: error instanceof Error ? error.message : "Failed to create warehouse." }, { status });
  }
}

