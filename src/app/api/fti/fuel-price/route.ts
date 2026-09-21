import { NextRequest, NextResponse } from "next/server";
import { requireAuthenticatedSession } from "@/lib/auth/session";
import { getGlobalFuelPrice, setGlobalFuelPrice } from "@/lib/ftiFuelPrice";
import { canManageFuelPrice } from "@/lib/technicianEarningsAccess";

export async function GET() {
  const session = await requireAuthenticatedSession();
  if (session instanceof Response) return session;
  return NextResponse.json({ fuelPrice: await getGlobalFuelPrice(), canManage: await canManageFuelPrice(session) });
}

export async function PUT(request: NextRequest) {
  const session = await requireAuthenticatedSession();
  if (session instanceof Response) return session;
  if (!(await canManageFuelPrice(session))) return NextResponse.json({ error: "Only the After Sales Manager can set the fuel price." }, { status: 403 });
  const fuelPrice = Number((await request.json()).fuelPrice);
  await setGlobalFuelPrice(fuelPrice);
  return NextResponse.json({ fuelPrice });
}
