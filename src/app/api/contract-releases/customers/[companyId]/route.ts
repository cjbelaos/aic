import { NextResponse } from "next/server";
import { requireAuthenticatedSession } from "@/lib/auth/session";
import { getCustomerLedger } from "@/lib/contractReleases/source";

type Context = { params: Promise<{ companyId: string }> };

/** One customer's active agreements with what is owed per item and the DRs that released them. */
export async function GET(_request: Request, { params }: Context) {
  const session = await requireAuthenticatedSession();
  if (session instanceof Response) return session;
  try {
    const { companyId } = await params;
    return NextResponse.json(await getCustomerLedger(decodeURIComponent(companyId)));
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to load the customer ledger.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
