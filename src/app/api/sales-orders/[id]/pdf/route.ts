import { NextResponse } from "next/server";
import { requireSalesPermission, salesErrorResponse, toActor } from "@/lib/salesOrders/http-helpers";
import { getOrderDetail, attachDocument } from "@/lib/salesOrders/service";
import { renderSalesOrderPdf, salesOrderPdfFileName } from "@/lib/salesOrders/pdf";
import { getDriveUploadClient } from "@/lib/googleSheets";

const DEFAULT_SALES_ORDER_DRIVE_FOLDER_ID = "19919wVs7xuxSr1CCxPQjPU6xslnulWd9";

/**
 * POST /api/sales-orders/[id]/pdf — generates a REAL PDF artifact for the
 * order's current version.
 *
 * The PDF is uploaded to the configured Sales Orders Drive folder (or the
 * approved default folder) using real-user OAuth, then recorded as a
 * SALES_ORDER_PDF document through the locked gateway. The order is never
 * touched by a failed render or upload.
 */
export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const auth = await requireSalesPermission("so.attach");
  if (auth.response) return auth.response;
  try {
    const { id } = await params;
    const detail = await getOrderDetail(id);
    if (detail.order.orderStatus === "DRAFT") {
      return NextResponse.json(
        { code: "VALIDATION", message: "Printing is allowed after confirmation when the order has a number." },
        { status: 422 },
      );
    }
    const buffer = await renderSalesOrderPdf({
      order: detail.order,
      items: detail.items,
      history: detail.history,
      documents: detail.documents,
      totals: detail.totals,
    });
    if (!Buffer.isBuffer(buffer) || buffer.length < 5 || buffer.subarray(0, 4).toString("latin1") !== "%PDF") {
      throw new Error("The PDF renderer produced an invalid artifact.");
    }
    const fileName = salesOrderPdfFileName(detail.order);
    const driveFolderId = process.env.GOOGLE_DRIVE_SALES_ORDERS_FOLDER_ID?.trim()
      || DEFAULT_SALES_ORDER_DRIVE_FOLDER_ID;
    const drive = await getDriveUploadClient();
    const uploaded = await drive.files.create({
      requestBody: { name: fileName, parents: [driveFolderId] },
      media: { mimeType: "application/pdf", body: buffer },
      fields: "id,name,webViewLink",
    });
    const driveFileId = uploaded.data.id;
    if (!driveFileId) throw new Error("Drive did not return a file ID.");
    const document = await attachDocument(toActor(auth.session), id, {
      commandId: crypto.randomUUID(),
      documentType: "SALES_ORDER_PDF",
      externalDocumentNo: detail.order.salesOrderNo,
      driveFileId,
      externalUrl: uploaded.data.webViewLink || `https://drive.google.com/file/d/${driveFileId}/view`,
      fileName,
      mimeType: "application/pdf",
      orderVersion: detail.order.version,
    });
    return NextResponse.json({ success: true, document }, { status: 201 });
  } catch (error) {
    return salesErrorResponse(error);
  }
}
