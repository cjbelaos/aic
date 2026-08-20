import { NextResponse } from "next/server";
import { requireAuthenticatedSession } from "@/lib/auth/session";
import { getContractItems, addContractItem } from "@/lib/contractItemSheets";
import { CreateContractItemPayload } from "@/types/contract";

/**
 * GET /api/contract-items
 * Optional:
 * ?contractId=CTR-0001
 */
export async function GET(request: Request) {
  const session = await requireAuthenticatedSession();
  if (session instanceof Response) return session;

  try {
    const { searchParams } = new URL(request.url);
    const contractId = searchParams.get("contractId") || undefined;

    const items = await getContractItems(contractId);

    return NextResponse.json(items, { status: 200 });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Failed to fetch contract items.",
      },
      { status: 500 },
    );
  }
}

/**
 * POST /api/contract-items
 */
export async function POST(request: Request) {
  const session = await requireAuthenticatedSession();
  if (session instanceof Response) return session;

  try {
    const body: CreateContractItemPayload = await request.json();

    const created = await addContractItem(body);

    return NextResponse.json(created, { status: 201 });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Failed to create contract item.",
      },
      { status: 500 },
    );
  }
}
