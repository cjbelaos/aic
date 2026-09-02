import { NextRequest, NextResponse } from "next/server";
import { requireAuthenticatedSession } from "@/lib/auth/session";
import { uploadReceiptFile, deleteReceiptFile } from "@/lib/receiptUpload";

/**
 * ISOLATED SANDBOX API — `/api/liquidation-v2/upload`.
 * Mirrors the production `/api/liquidations/upload` route. Receipt photos
 * upload to Google Drive (shared Drive folder); the sheet records written by
 * the V2 flow still land only in `ReceiptItems_V2`.
 */

export async function POST(req: NextRequest) {
  const session = await requireAuthenticatedSession();
  if (session instanceof Response) return session;

  let formData: FormData;
  try {
    formData = await req.formData();
  } catch {
    return NextResponse.json(
      { error: "Invalid multipart form data." },
      { status: 400 },
    );
  }

  const file = formData.get("file");
  if (!file || typeof file === "string") {
    return NextResponse.json(
      { error: "Missing file field in upload." },
      { status: 400 },
    );
  }

  const liquidationId = (formData.get("liquidationId") || "").toString();

  // Reasonable size cap (10 MB) so we don't stream multi-hundred-MB files.
  if (file.size > 10 * 1024 * 1024) {
    return NextResponse.json(
      { error: "File must be 10 MB or smaller." },
      { status: 400 },
    );
  }

  try {
    const buffer = Buffer.from(await file.arrayBuffer());
    const result = await uploadReceiptFile({
      fileBuffer: buffer,
      filename: file.name || "receipt",
      mimeType: file.type || "application/octet-stream",
      liquidationId: liquidationId || undefined,
    });

    return NextResponse.json({
      success: true,
      fileId: result.fileId,
      receiptImageUrl: result.webViewLink,
      proxyUrl: result.proxyUrl,
      fileName: file.name,
    });
  } catch (error) {
    console.error("Receipt V2 upload error:", error);
    return NextResponse.json(
      { error: (error as Error).message || "Failed to upload receipt." },
      { status: 500 },
    );
  }
}

export async function DELETE(req: NextRequest) {
  const session = await requireAuthenticatedSession();
  if (session instanceof Response) return session;

  const fileId = (req.nextUrl.searchParams.get("fileId") || "").trim();
  if (!fileId) {
    return NextResponse.json(
      { error: "Missing fileId query parameter." },
      { status: 400 },
    );
  }

  try {
    await deleteReceiptFile(fileId);
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Receipt V2 delete error:", error);
    return NextResponse.json(
      { error: (error as Error).message || "Failed to delete receipt." },
      { status: 500 },
    );
  }
}