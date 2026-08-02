import { NextRequest, NextResponse } from "next/server";
import { Readable } from "stream";
import { getSheetsAndDriveClient } from "@/lib/googleSheets";
import { getSession } from "@/lib/auth/session";

const FTI_DRIVE_FOLDER_ID = "1nwGI5ZBTJaPgfh7260X_kxP3goZcnXsc";

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
    const ftiRef = formData.get("ftiRef") as string | null;

    if (!pdfFile) {
      return NextResponse.json(
        { error: "No PDF file provided." },
        { status: 400 },
      );
    }

    if (!ftiRef) {
      return NextResponse.json(
        { error: "No FTI reference provided." },
        { status: 400 },
      );
    }

    // Convert the File to a Buffer, then a Readable stream (googleapis requires
    // media.body to be a stream — a raw Buffer has no .pipe method).
    const arrayBuffer = await pdfFile.arrayBuffer();
    const pdfBuffer = Buffer.from(arrayBuffer);
    const pdfStream = Readable.from(pdfBuffer);

    // Get Drive client
    const { drive } = await getSheetsAndDriveClient();

    // Check if folder exists, if not create it
    let folderId = FTI_DRIVE_FOLDER_ID;
    try {
      await drive.files.get({ fileId: folderId });
    } catch {
      // Folder doesn't exist, create it
      const folderRes = await drive.files.create({
        requestBody: {
          name: "FTI PDFs",
          mimeType: "application/vnd.google-apps.folder",
          parents: [],
        },
      });
      folderId = folderRes.data.id!;
    }

    // Check if file with same name already exists
    const fileName = `FTI_${ftiRef}.pdf`;
    const existingRes = await drive.files.list({
      q: `'${folderId}' in parents and name = '${fileName}' and trashed = false`,
      fields: "files(id, name)",
    });

    let fileId: string;

    if (existingRes.data.files && existingRes.data.files.length > 0) {
      // Update existing file
      fileId = existingRes.data.files[0].id!;
      await drive.files.update({
        fileId,
        media: {
          mimeType: "application/pdf",
          body: pdfStream,
        },
      });
    } else {
      // Create new file
      const uploadRes = await drive.files.create({
        requestBody: {
          name: fileName,
          parents: [folderId],
        },
        media: {
          mimeType: "application/pdf",
          body: pdfStream,
        },
      });
      fileId = uploadRes.data.id!;
    }

    const fileLink = `https://drive.google.com/file/d/${fileId}/view`;

    return NextResponse.json({
      success: true,
      fileId,
      fileLink,
      message: `PDF saved to Google Drive as ${fileName}`,
    });
  } catch (error) {
    console.error("Save PDF to Drive error:", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Failed to save PDF to Google Drive",
      },
      { status: 500 },
    );
  }
}
