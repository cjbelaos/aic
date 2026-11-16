import { after, NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { getFTIRequestFull } from "@/lib/ftiSheets";
import { getUserApprovers } from "@/lib/userApproverSheets";
import { withFTIWriteLock, FTIWriteConflict } from "@/lib/ftiWriteLock";
import { queueFTIPdf, processFTIPdfJobs } from "@/lib/ftiPdfJobs";

export const maxDuration = 60;

// Regenerate from saved data only: old browser uploads must never overwrite a newer PDF.
export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  const body = await req.json().catch(() => null);
  if (!body?.controlNo || !body?.expectedRevision) {
    return NextResponse.json({ error: "Reload the FTI before regenerating its PDF.", code: "FTI_CHANGED" }, { status: 409 });
  }
  try {
    const result = await withFTIWriteLock(async () => {
      const full = await getFTIRequestFull(body.controlNo, true);
      if (!full) return NextResponse.json({ error: "FTI not found." }, { status: 404 });
      const mappings = await getUserApprovers("FTI");
      const allowed = session.userRoleId === 1 || full.userId === session.userId || full.approvedByUserId === session.userId || mappings.some(m => m.requesterUserId === full.userId && m.approverUserId === session.userId);
      if (!allowed) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      if (body.expectedRevision !== full.revision) {
        return NextResponse.json({ error: "This FTI has changed. Reload it before regenerating the PDF.", code: "FTI_CHANGED" }, { status: 409 });
      }
      await queueFTIPdf(full.controlNo);
      return NextResponse.json({ success: true, pdfStatus: "PENDING" });
    });
    if (result.ok) after(() => processFTIPdfJobs().catch(() => undefined));
    return result;
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "PDF regeneration failed." }, { status: error instanceof FTIWriteConflict ? 409 : 500 });
  }
}

// Client-side rollback is obsolete; it could delete a newer successfully regenerated file.
export async function DELETE() {
  return NextResponse.json({ error: "FTI PDFs are managed by the server." }, { status: 405 });
}
