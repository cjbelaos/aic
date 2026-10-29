import { requireAuthenticatedSession } from "@/lib/auth/session";
import { updateContractNote, deleteContractNote, ContractNoteError } from "@/lib/contractNoteSheets";

type Context = { params: Promise<{ id: string; noteId: string }> };

export async function PUT(request: Request, { params }: Context) {
  const session = await requireAuthenticatedSession();
  if (session instanceof Response) return session;
  try {
    const { id, noteId } = await params;
    const body = await request.json();
    return Response.json(await updateContractNote(id, noteId, body?.text));
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Failed to update note." }, { status: error instanceof ContractNoteError ? error.status : error instanceof SyntaxError ? 400 : 500 });
  }
}

export async function DELETE(_request: Request, { params }: Context) {
  const session = await requireAuthenticatedSession();
  if (session instanceof Response) return session;
  try {
    const { id, noteId } = await params;
    await deleteContractNote(id, noteId);
    return new Response(null, { status: 204 });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Failed to delete note." }, { status: error instanceof ContractNoteError ? error.status : 500 });
  }
}
