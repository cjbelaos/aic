import { NextResponse } from "next/server";
import { requireAdminSession } from "@/lib/auth/session";
import { updatePaymentTerm } from "@/lib/paymentTermSheets";
import type { UpdatePaymentTermPayload } from "@/types/paymentTerm";
export async function PUT(request: Request, { params }: { params: Promise<{ id: string }> }) { const session = await requireAdminSession(); if (session instanceof Response) return session; const { id } = await params; try { return NextResponse.json(await updatePaymentTerm({ ...(await request.json()) as Partial<UpdatePaymentTermPayload>, paymentTermId: id }, session.userId)); } catch (error) { const message = error instanceof Error ? error.message : "Failed to update payment term."; return NextResponse.json({ error: message }, { status: message === "Payment term not found." ? 404 : error instanceof Error && error.name === "ConflictError" ? 409 : 400 }); } }
