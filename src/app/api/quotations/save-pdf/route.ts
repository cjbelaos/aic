import { NextResponse } from "next/server";
import { Readable } from "stream";
import { requireAuthenticatedSession } from "@/lib/auth/session";
import { getDatabaseSpreadsheetId, getDriveUploadClient, getSheetsClient } from "@/lib/googleSheets";

export async function POST(request: Request) {
  const session = await requireAuthenticatedSession();
  if (session instanceof Response) return session;
  try {
    const { quotationNo, pdfBase64 } = await request.json();
    if (typeof quotationNo !== "string" || !quotationNo.trim() || typeof pdfBase64 !== "string" || !pdfBase64.startsWith("JVBERi0") || pdfBase64.length > 28_000_000 || !/^[A-Za-z0-9+/]+={0,2}$/.test(pdfBase64)) {
      return NextResponse.json({ error: "A quotation number and valid PDF under 20 MB are required." }, { status: 400 });
    }
    const sheets = await getSheetsClient();
    const spreadsheetId = await getDatabaseSpreadsheetId();
    const rows = (await sheets.spreadsheets.values.get({ spreadsheetId, range: "Quotations!A2:P" })).data.values || [];
    const index = rows.findIndex(row => String(row[0]).trim() === quotationNo.trim());
    if (index < 0) return NextResponse.json({ error: "Quotation not found." }, { status: 404 });
    const storedLink = String(rows[index][6] || "");
    const storedId = storedLink.match(/\/d\/([a-zA-Z0-9_-]+)/)?.[1] || storedLink.match(/[?&]id=([a-zA-Z0-9_-]+)/)?.[1];
    const drive = await getDriveUploadClient();
    const name = `Quotation - ${quotationNo} - ${String(rows[index][1] || "").replace(/[/\\?%*:'|"<>]/g, "_")}.pdf`;
    const media = { mimeType: "application/pdf", body: Readable.from(Buffer.from(pdfBase64, "base64")) };
    let fileId = storedId;
    if (fileId) {
      await drive.files.update({ fileId, requestBody: { name }, media });
    } else {
      const folderId = process.env.GOOGLE_DRIVE_FOLDER_ID;
      if (!folderId) throw new Error("Missing GOOGLE_DRIVE_FOLDER_ID environment variable.");
      fileId = (await drive.files.create({ requestBody: { name, parents: [folderId] }, media, fields: "id" })).data.id || undefined;
    }
    if (!fileId) throw new Error("Drive did not return a file ID.");
    const fileLink = `https://drive.google.com/file/d/${fileId}/view`;
    await sheets.spreadsheets.values.batchUpdate({ spreadsheetId, requestBody: { valueInputOption: "RAW", data: [
      { range: `Quotations!G${index + 2}`, values: [[fileLink]] },
      { range: `Quotations!O${index + 2}:P${index + 2}`, values: [[session.username, new Date().toISOString()]] },
    ] } });
    return NextResponse.json({ success: true, fileLink });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Failed to save quotation PDF." }, { status: 500 });
  }
}
