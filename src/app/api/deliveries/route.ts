import { NextResponse } from "next/server";
import { Readable } from "stream";
import { requireAuthenticatedSession } from "@/lib/auth/session";
import {
  processDeliveryReceipt,
  getDeliveryReceipts,
  exportDeliveryReceiptFormPdf,
} from "@/lib/deliverySheets";
import { getDriveUploadClient, resolveDriveFolderPath, MONTH_NAMES, getDatabaseSpreadsheetId, getSheetsClient } from "@/lib/googleSheets";
import { CreateDeliveryPayload } from "@/types/deliveryReceipt";
import { getOrderDetail } from "@/lib/salesOrders/service";
import { postFinalizedDeliveryReleaseFulfillment } from "@/lib/deliverySalesOrderIntegration";
import { can } from "@/lib/salesOrders/permissions";

const DR_PARENT_FOLDER_ID = "1AuGCBFxa-wp-SdfYXf_YTgY7wgtYHILo";

export async function GET() {
  const session = await requireAuthenticatedSession();
  if (session instanceof Response) return session;

  try {
    const receipts = await getDeliveryReceipts();
    return NextResponse.json(receipts, { status: 200 });
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Failed to fetch delivery receipts.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const session = await requireAuthenticatedSession();
  if (session instanceof Response) return session;

  try {
    const body: CreateDeliveryPayload & { pdfFormat?: "html" } = await request.json();

    if (!body.companyId?.trim()) {
      return NextResponse.json(
        { error: "Company is required." },
        { status: 400 },
      );
    }

    const isDraft = body.status === "draft";

    // A Delivery Release may retain a legacy TR value, but newly linked
    // releases use the immutable Sales Order ID and display its SO number.
    // Validate server-side so a browser cannot attach a release to another
    // customer's order or invent an SO number.
    if (body.salesOrderId) {
      const salesOrder = await getOrderDetail(body.salesOrderId);
      if (salesOrder.order.orderStatus !== "CONFIRMED" && salesOrder.order.orderStatus !== "ON_HOLD") {
        return NextResponse.json(
          { error: "A Delivery Release can be linked only to a confirmed or on-hold Sales Order." },
          { status: 422 },
        );
      }
      if (salesOrder.order.customerId !== body.companyId) {
        return NextResponse.json(
          { error: "The selected Sales Order belongs to a different customer." },
          { status: 422 },
        );
      }
      body.salesOrderNo = salesOrder.order.salesOrderNo;
      body.trNo = salesOrder.order.salesOrderNo;
      if (!body.poNo) body.poNo = salesOrder.order.customerPONo;

      const orderItems = new Map(salesOrder.items.map((item) => [item.salesOrderItemId, item]));
      for (const [index, item] of body.items.entries()) {
        const source = item.salesOrderItemId ? orderItems.get(item.salesOrderItemId) : undefined;
        if (!source || source.lineType !== "PRODUCT" || source.lineStatus !== "ACTIVE") {
          return NextResponse.json(
            { error: `Delivery line ${index + 1} must reference an active product line on the selected Sales Order.` },
            { status: 422 },
          );
        }
        const remaining = Math.max(0, (source.quantity ?? 0) - source.fulfilledQty - source.cancelledQty);
        if (!(item.quantity > 0) || item.quantity > remaining) {
          return NextResponse.json(
            { error: `Delivery line ${index + 1} exceeds the selected Sales Order line's remaining quantity (${remaining}).` },
            { status: 422 },
          );
        }
        if (source.productId && item.productId && source.productId !== item.productId) {
          return NextResponse.json(
            { error: `Delivery line ${index + 1} does not match its selected Sales Order item.` },
            { status: 422 },
          );
        }
      }
    }

    if (!isDraft) {
      if (!body.preparedBy?.trim()) {
        return NextResponse.json(
          { error: "Prepared by is required." },
          { status: 400 },
        );
      }
      if (!body.deliveredBy?.trim()) {
        return NextResponse.json(
          { error: "Delivered by is required." },
          { status: 400 },
        );
      }
      if (!body.items || body.items.length === 0) {
        return NextResponse.json(
          { error: "At least one product item is required." },
          { status: 400 },
        );
      }
    }

    const result = await processDeliveryReceipt(body, session.userId);
    let fulfillment: { state: string; posted: number; alreadyPosted: number } | undefined;
    if (!isDraft && body.salesOrderId) {
      const permission = can("so.fulfill", { roleId: session.userRoleId, actorUserId: session.userId });
      if (!permission.allowed) {
        fulfillment = { state: "PENDING_AUTHORIZATION", posted: 0, alreadyPosted: 0 };
      } else {
        try {
          fulfillment = await postFinalizedDeliveryReleaseFulfillment(result.drNumber, {
            userId: session.userId,
            displayName: session.fullName,
          });
        } catch (error) {
          // The delivery evidence is durable. Do not turn a successful release
          // into a failed browser response; the reconciliation endpoint can
          // safely retry this deterministic source operation.
          console.error("Delivery Release saved but Sales Order fulfillment needs reconciliation:", error);
          fulfillment = { state: "PENDING_RECONCILIATION", posted: 0, alreadyPosted: 0 };
        }
      }
    }

    // ── Auto-save PDF to Google Drive and store link (skip for drafts) ──
    let driveFileLink: string | undefined;
    if (!isDraft && body.pdfFormat !== "html") {
      try {
      const { year, monthName, monthYear } = (() => {
        if (body.date) {
          const d = new Date(body.date + (body.date.length === 10 ? "T00:00:00" : ""));
          if (!isNaN(d.getTime())) {
            return {
              year: String(d.getFullYear()),
              monthName: MONTH_NAMES[d.getMonth()],
              monthYear: `${String(d.getMonth() + 1).padStart(2, "0")}-${d.getFullYear()}`,
            };
          }
        }
        return { year: "", monthName: "", monthYear: "" };
      })();

      const safeName = result.companyName.replace(/[/\\?%*:'|"<> ]+/g, "_");
      const fileName = `DR-${monthYear}-${result.drNumber}_${safeName}.pdf`;

      const { pdfBase64 } = await exportDeliveryReceiptFormPdf();
      const pdfBuffer = Buffer.from(pdfBase64, "base64");
      const pdfStream = Readable.from(pdfBuffer);

      const drive = await getDriveUploadClient();
      let targetFolderId = DR_PARENT_FOLDER_ID;
      if (year) {
        try {
          targetFolderId = await resolveDriveFolderPath(
            drive,
            DR_PARENT_FOLDER_ID,
            year,
            monthName,
          );
        } catch (folderErr) {
          // Non-fatal: fall back to the parent DR folder so the PDF still saves.
          console.warn(
            `Failed to resolve year/month folder (${year}/${monthName}); saving to parent folder.`,
            folderErr,
          );
        }
      }

      const uploadRes = await drive.files.create({
        requestBody: { name: fileName, parents: [targetFolderId] },
        media: { mimeType: "application/pdf", body: pdfStream },
      });

      driveFileLink = `https://drive.google.com/file/d/${uploadRes.data.id}/view`;

      // Store the link in column L (DriveFileLink) of the DR header row.
      const sheets = await getSheetsClient();
      const spreadsheetId = await getDatabaseSpreadsheetId();
      const allRows = await sheets.spreadsheets.values.get({
        spreadsheetId,
        range: "DeliveryReceipts!A2:A",
      });
      const rows = allRows.data.values || [];
      const drRowIdx = rows.findIndex((row) => {
        const val = parseInt(String(row[0] ?? "").trim(), 10);
        return val === result.drNumber;
      });
      if (drRowIdx >= 0) {
        await sheets.spreadsheets.values.update({
          spreadsheetId,
          range: `DeliveryReceipts!L${drRowIdx + 2}`,
          valueInputOption: "USER_ENTERED",
          requestBody: { values: [[driveFileLink]] },
        });
      }
    } catch (e) {
      console.warn("Auto-save DR PDF to Drive failed (non-fatal):", e);
    }
    }

    return NextResponse.json(
      { ...result, driveFileLink, fulfillment },
      { status: 201 },
    );
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Failed to process delivery receipt.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
