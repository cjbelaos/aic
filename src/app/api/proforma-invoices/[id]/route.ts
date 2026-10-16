import { NextResponse } from "next/server";
import { requireAuthenticatedSession } from "@/lib/auth/session";
import { changeProforma, getProforma } from "@/lib/proforma/service";
import { proformaError } from "@/lib/proforma/http";
type Context = { params: Promise<{ id: string }> };
export async function GET(_request: Request, context: Context) {
  const session = await requireAuthenticatedSession();
  if (session instanceof Response) return session;
  try { return NextResponse.json(await getProforma((await context.params).id)); } catch (error) { return proformaError(error); }
}
export async function PATCH(request: Request, context: Context) {
  const session = await requireAuthenticatedSession();
  if (session instanceof Response) return session;
  try {
    const body = await request.json();
    return NextResponse.json(await changeProforma((await context.params).id, body.action, body.expectedVersion, session, body.notes));
  } catch (error) { return proformaError(error); }
}
