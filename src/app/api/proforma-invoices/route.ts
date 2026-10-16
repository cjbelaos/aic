import { NextResponse } from "next/server";
import { requireAuthenticatedSession } from "@/lib/auth/session";
import { readProformas } from "@/lib/proforma/repository";
import { saveProforma } from "@/lib/proforma/service";
import { proformaError } from "@/lib/proforma/http";
export async function GET(request: Request) {
  const session = await requireAuthenticatedSession();
  if (session instanceof Response) return session;
  try {
    const orderId = new URL(request.url).searchParams.get("salesOrderId");
    const invoices = await readProformas();
    return NextResponse.json(orderId ? invoices.filter(invoice => invoice.salesOrderId === orderId) : invoices);
  } catch (error) { return proformaError(error); }
}
export async function POST(request: Request) {
  const session = await requireAuthenticatedSession();
  if (session instanceof Response) return session;
  try { return NextResponse.json(await saveProforma(await request.json(), session)); } catch (error) { return proformaError(error); }
}
