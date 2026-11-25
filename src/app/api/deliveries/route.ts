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
import { linkOrderProductLines, salesOrderDeliveryLineError } from "@/lib/deliverySalesOrderLines";
import { getProducts } from "@/lib/productSheets";
import { getCompanies } from "@/lib/companySheets";
import { validateForCompany } from "@/lib/deliveryPrintForm";
import {
  isDeliveryReferenceMode,
  resolveDeliveryReference,
} from "@/lib/deliveryReference";
import { postFinalizedDeliveryReleaseFulfillment } from "@/lib/deliverySalesOrderIntegration";
import { can } from "@/lib/salesOrders/permissions";
import { activeWarehouseError, guardedDrWrite, inventoryErrorResponse } from "@/lib/inventory/drGuard";
import { getContracts } from "@/lib/contractSheets";
import { getContractItems } from "@/lib/contractItemSheets";
import { appendContractReleases, generateReleaseId } from "@/lib/contractReleaseSheets";
import { buildContractReleaseRows, validateContractLines } from "@/lib/contractReleases/lines";
import { manilaToday } from "@/lib/contractStatus";
import { getPeriodInfo } from "@/lib/utils/contractRelease.utils";
import type { ContractItem } from "@/types/contract";

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
    if (body.forCompanyId) {
      const forError = validateForCompany(await getCompanies(), body.companyId, body.forCompanyId);
      if (forError) return NextResponse.json({ error: forError }, { status: 422 });
    }

    const isDraft = body.status === "draft";

    // The reference is either a selected Sales Order (current flow) or a
    // manually typed legacy TR Number. Validate it here so a browser cannot skip
    // the rule, and keep the modes mutually exclusive: a legacy TR Number never
    // carries a Sales Order link.
    const reference = resolveDeliveryReference({
      referenceMode: body.referenceMode,
      salesOrderId: body.salesOrderId,
      salesOrderNo: body.salesOrderNo,
      trNo: body.trNo,
      noChargeReason: body.noChargeReason,
      noChargeNote: body.noChargeNote,
    });
    if (reference.error) {
      return NextResponse.json({ error: reference.error }, { status: 422 });
    }
    if (isDeliveryReferenceMode(body.referenceMode)) {
      body.salesOrderId = reference.salesOrderId || undefined;
      body.trNo = reference.trNo;
      body.noChargeReason = reference.noChargeReason;
      body.noChargeNote = reference.noChargeNote;
    }
    // A free delivery never counts against a contract.
    if (reference.mode === "NO_CHARGE" && body.contractLines?.length) {
      return NextResponse.json({ error: "A no-charge DR can't release contract items." }, { status: 422 });
    }

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
      // A selected Sales Order owns the Customer PO field. Never accept a
      // browser supplied substitute, including a non-empty stale value.
      body.poNo = salesOrder.order.customerPONo || "";

      // Parts without a Sales Order line are allowed on a service order; they
      // are checked below like any hand-picked line and never post fulfilment.
      // A hand-entered line for a product the order sells is that order line.
      body.items = linkOrderProductLines(body.items ?? [], salesOrder.items);
      const lineError = salesOrderDeliveryLineError(body.items, salesOrder.items, salesOrder.order.salesOrderNo);
      if (lineError) return NextResponse.json({ error: lineError }, { status: 422 });
    }

    // Lines picked by hand must use an active product. Lines taken from a Sales Order are exempt so an
    // order placed before a product was deactivated can still be delivered.
    const manualLines = (body.items ?? []).filter((item) => !item.salesOrderItemId && (item.productId || item.productCode));
    if (manualLines.length) {
      const products = await getProducts();
      for (const item of manualLines) {
        const product = products.find((entry) => (item.productId ? entry.productId === item.productId : entry.productCode.toLowerCase() === String(item.productCode).toLowerCase()));
        if (product && product.status !== "active") {
          return NextResponse.json({ error: `Product "${product.productCode}" is inactive and cannot be added to a Delivery Release.` }, { status: 422 });
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

    if (!isDraft) {
      const warehouseError = await activeWarehouseError(body.warehouseId);
      if (warehouseError) return NextResponse.json({ error: warehouseError }, { status: 422 });
    }

    // Contract entitlements released on this DR. Validated up front so a bad
    // line never leaves a DR behind; the rows are appended after the write.
    const contractLines = isDraft ? [] : body.contractLines ?? [];
    let contractItems: ContractItem[] = [];
    if (contractLines.length) {
      const [contracts, items] = await Promise.all([getContracts(), getContractItems()]);
      contractItems = items;
      const check = validateContractLines({
        lines: contractLines,
        companyId: body.companyId,
        forCompanyId: body.forCompanyId,
        salesOrderId: body.salesOrderId,
        items: body.items ?? [],
        contractItems,
        contracts,
        date: body.date,
        today: manilaToday(),
      });
      if ("error" in check) return NextResponse.json({ error: check.error }, { status: 422 });
    }

    let contractReleaseError: string | undefined;

    // Stock guard + write in one inventory lock. The guard decides the saved
    // status: blocked (409), pending_approval, or the requested status.
    const { result, decision } = await guardedDrWrite(
      session,
      { warehouseId: body.warehouseId ?? "", date: body.date, requestedStatus: body.status ?? "created", items: body.items ?? [] },
      async (stock) => {
        body.status = stock.status;
        // Server-owned fields: never trust values sent by the browser.
        Object.assign(body, stock.approval, { requestedStatus: stock.requestedStatus });
        const saved = await processDeliveryReceipt(body, session.userId);
        // Every saved status except draft records the release; whether it counts
        // (e.g. still pending approval) is decided from the DR status at read time.
        // Written inside the inventory lock so concurrent DRs cannot reuse release ids.
        if (contractLines.length && stock.status !== "draft") {
          try {
            const nextId = await generateReleaseId();
            const lastReleaseId = `REL-${Number.parseInt(nextId.slice(4), 10) - 1}`;
            await appendContractReleases(
              buildContractReleaseRows({
                lines: contractLines,
                contractItems,
                lastReleaseId,
                date: body.date,
                releasedBy: body.preparedBy,
                remarks: body.comments,
                drNumber: saved.drNumber,
                periodOf: (frequency) => getPeriodInfo(new Date(body.date + "T00:00:00"), frequency),
              }),
            );
          } catch (e) {
            console.error(`DR ${saved.drNumber} saved but contract release rows failed:`, e);
            contractReleaseError = "DR saved but contract release was not recorded. Contact an admin.";
          }
        }
        return saved;
      },
    );
    // A DR waiting for approval is held like a draft: no fulfillment, no PDF.
    const isHeld = isDraft || decision.status === "pending_approval";
    let fulfillment: { state: string; posted: number; alreadyPosted: number } | undefined;
    if (!isHeld && body.salesOrderId) {
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
    if (!isHeld && body.pdfFormat !== "html") {
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
      { ...result, driveFileLink, fulfillment, check: decision.check, contractReleaseError },
      { status: 201 },
    );
  } catch (error) {
    const inventoryResponse = inventoryErrorResponse(error);
    if (inventoryResponse) return inventoryResponse;
    const message =
      error instanceof Error
        ? error.message
        : "Failed to process delivery receipt.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
