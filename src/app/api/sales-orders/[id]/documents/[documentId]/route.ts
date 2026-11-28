import { NextResponse } from "next/server";
import { requireSalesPermission, salesErrorResponse } from "@/lib/salesOrders/http-helpers";
import { getOrderDetail } from "@/lib/salesOrders/service";
import { getDriveUploadClient } from "@/lib/googleSheets";

/** Streams a document attached to this order (e.g. customer PO, quotation) inline. */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string; documentId: string }> }) {
  const auth = await requireSalesPermission("so.view");
  if (auth.response) return auth.response;
  try {
    const { id, documentId } = await params;
    const detail = await getOrderDetail(id, { historyLimit: 1 });
    const document = detail.documents.find((doc) => doc.documentId === documentId);
    if (!document) {
      return NextResponse.json({ code: "NOT_FOUND", message: "Document not found on this order." }, { status: 404 });
    }
    if (!document.driveFileId) {
      if (document.externalUrl) return NextResponse.redirect(document.externalUrl);
      return NextResponse.json({ code: "NOT_FOUND", message: "Document has no stored file." }, { status: 404 });
    }
    const drive = await getDriveUploadClient();
    const response = await drive.files.get({ fileId: document.driveFileId, alt: "media" }, { responseType: "arraybuffer" });
    const fileName = (document.fileName || "document").replace(/["\\\r\n]/g, "_");
    return new NextResponse(Buffer.from(response.data as ArrayBuffer), {
      status: 200,
      headers: {
        "Content-Type": document.mimeType || String(response.headers["content-type"] || "application/octet-stream"),
        "Content-Disposition": `inline; filename="${fileName}"`,
        "Cache-Control": "private, max-age=300",
      },
    });
  } catch (error) {
    return salesErrorResponse(error);
  }
}
