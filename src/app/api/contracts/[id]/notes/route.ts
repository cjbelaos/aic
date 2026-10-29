import { requireAuthenticatedSession } from "@/lib/auth/session";
import { addContractNote, ContractNoteError } from "@/lib/contractNoteSheets";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await requireAuthenticatedSession();
  if (session instanceof Response) return session;
  try {
    const { id } = await params;
    const body = await request.json();
    return Response.json(await addContractNote(id, body?.text), { status: 201 });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Failed to add note." }, { status: error instanceof ContractNoteError ? error.status : error instanceof SyntaxError ? 400 : 500 });
  }
}
