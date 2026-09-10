import { NextResponse } from "next/server";
import { requireAdminSession, requireAuthenticatedSession } from "@/lib/auth/session";
import { addPaymentTerm, getPaymentTerms } from "@/lib/paymentTermSheets";
import type { CreatePaymentTermPayload } from "@/types/paymentTerm";
export async function GET() { const session = await requireAuthenticatedSession(); if (session instanceof Response) return session; try { return NextResponse.json(await getPaymentTerms()); } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "Failed to fetch payment terms." }, { status: 500 }); } }
export async function POST(request: Request) { const session = await requireAdminSession(); if (session instanceof Response) return session; try { return NextResponse.json(await addPaymentTerm((await request.json()) as CreatePaymentTermPayload, session.userId), { status: 201 }); } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "Failed to create payment term." }, { status: error instanceof Error && error.name === "ConflictError" ? 409 : 400 }); } }
