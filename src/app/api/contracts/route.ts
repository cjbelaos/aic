import { NextResponse } from "next/server";
import { requireAuthenticatedSession } from "@/lib/auth/session";
import { getContracts, addContract } from "@/lib/contractSheets";
import { getCustomers } from "@/lib/companySheets";
import { CreateContractPayload } from "@/types/contract";

/**
 * GET /api/contracts
 * Fetches contract header entries.
 * Optional query parameter: ?companyId=COMP-0001
 */
export async function GET(request: Request) {
  const session = await requireAuthenticatedSession();
  if (session instanceof Response) return session;

  try {
    const { searchParams } = new URL(request.url);
    const companyId = searchParams.get("companyId");

    let contracts = await getContracts();

    if (companyId) {
      contracts = contracts.filter(
        (c) => c.companyId?.trim() === companyId.trim(),
      );
    }

    return NextResponse.json(contracts, { status: 200 });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to fetch contracts.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/**
 * POST /api/contracts
 * Creates a new contract header entry.
 */
export async function POST(request: Request) {
  const session = await requireAuthenticatedSession();
  if (session instanceof Response) return session;

  try {
    const body: CreateContractPayload = await request.json();

    if (!body.companyId?.trim()) {
      return NextResponse.json(
        { error: "Company ID is required." },
        { status: 400 },
      );
    }
    if (!body.agreementType?.trim()) {
      return NextResponse.json(
        { error: "Agreement type is required." },
        { status: 400 },
      );
    }
    if (!body.startDate?.trim()) {
      return NextResponse.json(
        { error: "Start date is required." },
        { status: 400 },
      );
    }
    if (!body.endDate?.trim()) {
      return NextResponse.json(
        { error: "End date is required." },
        { status: 400 },
      );
    }

    // Validate customer existence by Company ID
    const customers = await getCustomers();
    const customerExists = customers.some(
      (c) => c.companyId?.trim() === body.companyId.trim(),
    );
    if (!customerExists) {
      return NextResponse.json(
        { error: `Company with ID "${body.companyId}" not found.` },
        { status: 400 },
      );
    }

    const created = await addContract(body);
    return NextResponse.json(created, { status: 201 });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to create contract.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
