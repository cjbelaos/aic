import { after, NextRequest, NextResponse } from "next/server";
import { requireAuthenticatedSession } from "@/lib/auth/session";
import { getGlobalFuelPrice, setGlobalFuelPrice } from "@/lib/ftiFuelPrice";
import { canManageFuelPrice } from "@/lib/technicianEarningsAccess";
import { getFTIPdfJobSummary, processFTIPdfJobs } from "@/lib/ftiPdfJobs";
import { invalidateFTICache } from "@/lib/ftiSheets";
import { FTIWriteConflict } from "@/lib/ftiWriteLock";

export const maxDuration = 60;

export async function GET() {
  const session = await requireAuthenticatedSession();
  if (session instanceof Response) return session;
  const canManage = await canManageFuelPrice(session);
  return NextResponse.json({ fuelPrice: await getGlobalFuelPrice(), canManage, ...(canManage ? { pdfJobs: await getFTIPdfJobSummary() } : {}) });
}

export async function PUT(request: NextRequest) {
  const session = await requireAuthenticatedSession();
  if (session instanceof Response) return session;
  if (!(await canManageFuelPrice(session))) return NextResponse.json({ error: "Only the After Sales Manager can set the fuel price." }, { status: 403 });
  const body = await request.json().catch(() => null);
  const fuelPrice = body?.fuelPrice;
  if (typeof fuelPrice !== "number" || !Number.isFinite(fuelPrice) || fuelPrice <= 0) {
    return NextResponse.json({ error: "Fuel price must be greater than zero." }, { status: 400 });
  }
  try {
    const result = await setGlobalFuelPrice(fuelPrice);
    invalidateFTICache();
    after(() => processFTIPdfJobs().catch(() => undefined));
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Failed to update fuel price." }, { status: error instanceof FTIWriteConflict ? 409 : 500 });
  }
}
