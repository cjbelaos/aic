import { NextRequest, NextResponse } from "next/server";
import { Readable } from "stream";
import { requireAuthenticatedSession } from "@/lib/auth/session";
import { inTransaction, isPostgresBackend } from "@/lib/db/postgres";
import { getDriveUploadClient, findOrCreateDriveFolder } from "@/lib/googleSheets";
import { getCompanies } from "@/lib/companySheets";
import { trackerWarningAfterScan } from "@/lib/documentHandoverSheets";
import {
  completeDeliveryReceiptFromScan,
  ensureDeliveryReceiptScanColumns,
  findDeliveryReceiptForScan,
  recordDeliveryReceiptScan,
} from "@/lib/deliverySheets";

/** Scanned DR "DELIVERY RECEIPT" folder; scans are filed in a subfolder per year of the DR's delivery date. */
const DR_SCAN_DRIVE_FOLDER_ID = "1sya8h4vz1kuvCtuhcvO7PCoB0jZ0vxlB";
const ALLOWED_TYPES = ["application/pdf", "image/jpeg", "image/png", "image/webp"];

/**
 * POST /api/deliveries/upload-scanned
 * Uploads a signed, scanned Delivery Receipt to Drive, stores its link on the DR
 * (columns AB:AD), completes an issued DR, and returns its Document Tracker entry.
 *
 * Body: multipart/form-data with `file` and `drNumber`.
 * Returns: { success, fileLink, fileName, fileId, trackerWarning?, statusWarning? }
 */
export async function POST(req: NextRequest) {
  const session = await requireAuthenticatedSession();
  if (session instanceof Response) return session;

  let formData: FormData;
  try {
    formData = await req.formData();
  } catch {
    return NextResponse.json({ error: "Invalid multipart form data." }, { status: 400 });
  }

  const file = formData.get("file");
  const drNumberText = (formData.get("drNumber") || "").toString().trim();
  const drNumber = Number.parseInt(drNumberText, 10);
  if (!/^\d+$/.test(drNumberText) || drNumber <= 0) {
    return NextResponse.json({ error: "A valid drNumber is required." }, { status: 400 });
  }
  if (!file || typeof file === "string") {
    return NextResponse.json({ error: "Missing file field in upload." }, { status: 400 });
  }
  if (!ALLOWED_TYPES.includes(file.type)) {
    return NextResponse.json({ error: "Upload a PDF, JPEG, PNG or WebP scan." }, { status: 400 });
  }
  if (file.size > 10 * 1024 * 1024) {
    return NextResponse.json({ error: "File must be 10 MB or smaller." }, { status: 400 });
  }

  try {
    const receipt = await findDeliveryReceiptForScan(drNumber);
    if (!receipt) {
      return NextResponse.json({ error: `DR ${drNumber} not found.` }, { status: 404 });
    }

    // Before anything is uploaded: a sheet that can't hold the link must not leave a Drive file behind.
    await ensureDeliveryReceiptScanColumns();

    // PostgreSQL runs on staging: scans go only to a folder configured for it, never the production folder.
    const scanFolderId = isPostgresBackend() ? process.env.DR_SCAN_DRIVE_FOLDER_ID?.trim() : DR_SCAN_DRIVE_FOLDER_ID;
    if (!scanFolderId) {
      return NextResponse.json({ error: "Scanned copies can't be uploaded here yet: no Drive folder is configured for this environment (DR_SCAN_DRIVE_FOLDER_ID)." }, { status: 503 });
    }

    const year = /^\d{4}/.exec(receipt.date)?.[0] ?? String(new Date().getFullYear());
    const drive = await getDriveUploadClient();
    const yearFolderId = await findOrCreateDriveFolder(drive, year, scanFolderId);

    const safeBase = file.name.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 80);
    const fileName = `DR-SCANNED_${drNumber}_${Date.now()}_${safeBase}`;
    const uploaded = await drive.files.create({
      requestBody: { name: fileName, parents: [yearFolderId], mimeType: file.type },
      media: { mimeType: file.type, body: Readable.from(Buffer.from(await file.arrayBuffer())) },
      fields: "id",
      supportsAllDrives: true,
    });
    const fileId = uploaded.data.id || "";
    const fileLink = `https://drive.google.com/file/d/${fileId}/view`;

    try {
      await drive.permissions.create({ fileId, requestBody: { role: "reader", type: "anyone" }, supportsAllDrives: true });
    } catch (permError) {
      console.warn("Could not set public read permission on scanned DR file:", permError);
    }

    // A signed copy is back: record it, complete the DR and return it in the Document Tracker.
    // Neither later step undoes the saved scan. On PostgreSQL the three run in one transaction;
    // the two tolerated steps are savepoints, so their failure leaves the recorded scan intact.
    const recordScan = async () => {
      await recordDeliveryReceiptScan(receipt.rowNumber, fileLink, session.userId);
      let statusWarning: string | undefined;
      try {
        await completeDeliveryReceiptFromScan(drNumber, receipt.rowNumber, receipt.status, session.userId);
      } catch (error) {
        console.error("Scanned DR saved but its status could not be completed:", error);
        statusWarning = `Scan saved, but the DR was not marked completed: ${error instanceof Error ? error.message : "unknown error"}`;
      }
      const trackerWarning = await trackerWarningAfterScan({
        documentType: "delivery_receipt",
        documentNumber: String(drNumber),
        actor: session,
        resolveCustomerName: async () => {
          const company = (await getCompanies()).find((c) => c.companyId === receipt.companyId || c.id === receipt.companyId);
          return company?.companyName || receipt.companyId;
        },
      });
      return { statusWarning, trackerWarning };
    };
    const { statusWarning, trackerWarning } = isPostgresBackend() ? await inTransaction(session.userId, recordScan) : await recordScan();

    return NextResponse.json({ success: true, fileId, fileLink, fileName, trackerWarning, statusWarning });
  } catch (error) {
    console.error("Scanned DR upload error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to upload scanned DR." },
      { status: 500 },
    );
  }
}
