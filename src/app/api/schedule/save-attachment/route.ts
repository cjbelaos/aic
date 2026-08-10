import { NextRequest, NextResponse } from "next/server";
import { Readable } from "stream";
import { getSheetsAndDriveClient } from "@/lib/googleSheets";
import { getSession } from "@/lib/auth/session";

// "Schedule Attachments" Drive folder. Override per-environment via
// GOOGLE_SCHEDULE_DRIVE_FOLDER_ID in .env.local / hosting env vars.
const SCHEDULE_DRIVE_FOLDER_ID =
  process.env.GOOGLE_SCHEDULE_DRIVE_FOLDER_ID ||
  "1S6HWs0yh0FDTDkfePpZDKpUysj2_apJE";

function sanitizeFilename(value: string): string {
  return (
    value
      .replace(/[^\w\s-]/g, "") // strip symbols
      .replace(/\s+/g, "_")
      .trim() || "Attachment"
  );
}

export async function POST(req: NextRequest) {
  try {
    const session = await getSession();
    if (!session) {
      return NextResponse.json(
        { error: "Authentication required." },
        { status: 401 },
      );
    }

    const formData = await req.formData();
    const pdfFile = formData.get("pdf") as File | null;
    const kind = formData.get("kind") as string | null; // deliveryReport | serviceInvoice
    const scheduleId = formData.get("scheduleId") as string | null;
    const customerName = formData.get("customerName") as string | null;
    const date = formData.get("date") as string | null;

    if (!pdfFile) {
      return NextResponse.json(
        { error: "No PDF file provided." },
        { status: 400 },
      );
    }
    if (!kind || !["deliveryReport", "serviceInvoice"].includes(kind)) {
      return NextResponse.json(
        {
          error:
            "Invalid attachment kind. Use deliveryReport or serviceInvoice.",
        },
        { status: 400 },
      );
    }

    const arrayBuffer = await pdfFile.arrayBuffer();
    const pdfBuffer = Buffer.from(arrayBuffer);
    const pdfStream = Readable.from(pdfBuffer);

    const { drive } = await getSheetsAndDriveClient();

    // Ensure the schedule attachments folder exists.
    let folderId = SCHEDULE_DRIVE_FOLDER_ID;
    try {
      await drive.files.get({ fileId: folderId });
    } catch {
      const folderRes = await drive.files.create({
        requestBody: {
          name: "Schedule Attachments",
          mimeType: "application/vnd.google-apps.folder",
          parents: [],
        },
      });
      folderId = folderRes.data.id!;
    }

    const kindLabel =
      kind === "deliveryReport" ? "Delivery_Report" : "Service_Invoice";
    const safeCustomer = sanitizeFilename(customerName || "Customer");
    const safeDate = (date || "no-date").replace(/[^\w-]/g, "");
    const safeId = sanitizeFilename(scheduleId || "entry").slice(0, 12);
    const fileName = `${kindLabel}_${safeCustomer}_${safeDate}_${safeId}.pdf`;

    // Check for an existing file with the same name and overwrite it.
    const existingRes = await drive.files.list({
      q: `'${folderId}' in parents and name = '${fileName}' and trashed = false`,
      fields: "files(id, name)",
    });

    let fileId: string;
    if (existingRes.data.files && existingRes.data.files.length > 0) {
      fileId = existingRes.data.files[0].id!;
      await drive.files.update({
        fileId,
        media: { mimeType: "application/pdf", body: pdfStream },
      });
    } else {
      const uploadRes = await drive.files.create({
        requestBody: { name: fileName, parents: [folderId] },
        media: { mimeType: "application/pdf", body: pdfStream },
      });
      fileId = uploadRes.data.id!;
    }

    const fileLink = `https://drive.google.com/file/d/${fileId}/view`;

    return NextResponse.json({
      success: true,
      fileId,
      fileLink,
      kind,
      message: `Saved to Google Drive as ${fileName}`,
    });
  } catch (error) {
    console.error("Save schedule attachment error:", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Failed to save attachment to Google Drive",
      },
      { status: 500 },
    );
  }
}
