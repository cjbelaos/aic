import { NextResponse } from "next/server";
import { requireAuthenticatedSession } from "@/lib/auth/session";
import { proformaOptions } from "@/lib/proforma/service";
import { proformaError } from "@/lib/proforma/http";
export async function GET(request: Request) {
  const session = await requireAuthenticatedSession();
  if (session instanceof Response) return session;
  try { return NextResponse.json(await proformaOptions(new URL(request.url).searchParams.get("salesOrderId") || undefined)); } catch (error) { return proformaError(error); }
}
