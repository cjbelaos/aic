import { NextRequest, NextResponse } from "next/server";
import { Readable } from "stream";
import { requireAuthenticatedSession } from "@/lib/auth/session";
import { getDriveUploadClient } from "@/lib/googleSheets";
import { getContracts, updateContractDocumentLink } from "@/lib/contractSheets";

const CONTRACT_DOCUMENT_FOLDERS = {
  soft: "1THDq5QGRLxRE0ge5D442OCEDxJRJCwH7",
  signed: "1J-RBir06QvMzEOEXdXioIjUeM5VI2Q67",
} as const;

type DocumentType = keyof typeof CONTRACT_DOCUMENT_FOLDERS;

export async function POST(request: NextRequest) {
  const session = await requireAuthenticatedSession();
  if (session instanceof Response) return session;

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return NextResponse.json({ error: "Invalid upload form data." }, { status: 400 });
  }

  const file = formData.get("file");
  const contractId = String(formData.get("contractId") ?? "").trim();
  const documentType = String(formData.get("documentType") ?? "").trim();
  if (!contractId || !["soft", "signed"].includes(documentType)) {
    return NextResponse.json({ error: "contractId and a valid documentType are required." }, { status: 400 });
  }
  if (!file || typeof file === "string") {
    return NextResponse.json({ error: "Select a document to upload." }, { status: 400 });
  }
  if (file.size > 20 * 1024 * 1024) {
    return NextResponse.json({ error: "Files must be 20 MB or smaller." }, { status: 400 });
  }

  try {
    const contract = (await getContracts()).find((item) => item.id === contractId);
    if (!contract) return NextResponse.json({ error: "Contract not found." }, { status: 404 });

    const kind = documentType as DocumentType;
    const safeFileName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_").slice(0, 100);
    const prefix = kind === "soft" ? "CONTRACT_SOFT_COPY" : "CONTRACT_SIGNED_COPY";
    const drive = await getDriveUploadClient();
    const uploadedFile = await drive.files.create({
      requestBody: {
        name: `${prefix}_${contractId}_${Date.now()}_${safeFileName}`,
        parents: [CONTRACT_DOCUMENT_FOLDERS[kind]],
        mimeType: file.type || "application/octet-stream",
      },
      media: {
        mimeType: file.type || "application/octet-stream",
        body: Readable.from(Buffer.from(await file.arrayBuffer())),
      },
      fields: "id",
    });
    const fileId = uploadedFile.data.id;
    if (!fileId) throw new Error("Google Drive did not return a file ID.");
    const fileLink = `https://drive.google.com/file/d/${fileId}/view`;
    await updateContractDocumentLink(contractId, kind, fileLink);

    return NextResponse.json({ fileLink, fileName: safeFileName });
  } catch (error) {
    console.error("Contract document upload failed:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to upload contract document." },
      { status: 500 },
    );
  }
}
