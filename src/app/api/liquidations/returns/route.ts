import { NextRequest, NextResponse } from "next/server";
import { requireAuthenticatedSession } from "@/lib/auth/session";
import { getDriveUploadClient } from "@/lib/googleSheets";
import { assertCanRecordReturn, validateReturnDate } from "@/lib/liquidation-returns";
import { getReturnAccess, canViewReturn, withReturnAccess } from "@/lib/liquidation-return-access";
import { uploadReturnEvidence } from "@/lib/liquidation-return-evidence";
import { getReturnLiquidation, saveLiquidationReturn } from "@/lib/liquidationReturnSheets";

export async function POST(req: NextRequest) {
  const session = await requireAuthenticatedSession();
  if (session instanceof Response) return session;
  let form: FormData;
  try { form = await req.formData(); }
  catch { return NextResponse.json({ error: "Invalid multipart form data." }, { status: 400 }); }
  const id = String(form.get("liquidationId") || "").trim();
  const date = String(form.get("returnDate") || "").trim();
  if (!id) return NextResponse.json({ error: "Liquidation ID is required." }, { status: 400 });
  try {
    const liquidation = await getReturnLiquidation(id);
    if (!liquidation) return NextResponse.json({ error: "Liquidation not found." }, { status: 404 });
    if (liquidation.userId !== session.userId) {
      return NextResponse.json({ error: "Only the requestor can record or edit this return." }, { status: 403 });
    }
    assertCanRecordReturn(liquidation, session.userId);
    validateReturnDate(date);
    const file = form.get("file");
    if (typeof file === "string") throw new Error("Invalid evidence attachment.");
    if (!file && !liquidation.returnEvidenceFileId) throw new Error("A screenshot or photo is required as return evidence.");
    if (file && file.size > 10 * 1024 * 1024) throw new Error("Evidence must be 10 MB or smaller.");
    const evidence = file ? await uploadReturnEvidence(id, Buffer.from(await file.arrayBuffer()), file.name) : undefined;
    // Retain uploaded files on ambiguous Sheets failures: the write may have committed.
    const saved = await saveLiquidationReturn(id, session.userId, date, evidence);
    return NextResponse.json({ success: true, liquidation: { ...saved, canViewReturn: true, canRecordReturn: true } });
  } catch (error) {
    console.error("Record liquidation return failed:", error);
    return NextResponse.json({ error: (error as Error).message || "Could not save the return. Please try again." }, { status: 400 });
  }
}

export async function GET(req: NextRequest) {
  const session = await requireAuthenticatedSession();
  if (session instanceof Response) return session;
  const id = (req.nextUrl.searchParams.get("liquidationId") || "").trim();
  if (!id) return NextResponse.json({ error: "Liquidation ID is required." }, { status: 400 });
  try {
    const liquidation = await getReturnLiquidation(id);
    if (!liquidation) return NextResponse.json({ error: "Liquidation not found." }, { status: 404 });
    const access = await getReturnAccess(session);
    if (!canViewReturn(liquidation, access)) return NextResponse.json({ error: "Forbidden." }, { status: 403 });
    if (req.nextUrl.searchParams.get("evidence") !== "true") {
      return NextResponse.json({ liquidation: withReturnAccess(liquidation, access) }, { headers: { "Cache-Control": "private, no-store" } });
    }
    const fileId = liquidation.returnEvidenceFileId;
    if (!fileId) return NextResponse.json({ error: "No return evidence recorded." }, { status: 404 });
    const drive = await getDriveUploadClient();
    const metadata = await drive.files.get({ fileId, fields: "properties,mimeType" });
    if (metadata.data.properties?.purpose !== "liquidation-return" || metadata.data.properties?.liquidationId !== id) {
      return NextResponse.json({ error: "Invalid return evidence reference." }, { status: 400 });
    }
    const response = await drive.files.get({ fileId, alt: "media" }, { responseType: "arraybuffer" });
    return new NextResponse(Buffer.from(response.data as ArrayBuffer), { headers: {
      "Content-Type": metadata.data.mimeType || "application/octet-stream",
      "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff",
      "Content-Disposition": "inline",
    } });
  } catch (error) {
    console.error("Read liquidation return failed:", error);
    return NextResponse.json({ error: "Could not load return details. Please try again." }, { status: 500 });
  }
}
