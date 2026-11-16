import { Readable } from "node:stream";
import { getDatabaseSpreadsheetId, getSheetsClient, getDriveUploadClient } from "@/lib/googleSheets";
import { withFTIWriteLock, isUncertainFTIWrite } from "@/lib/ftiWriteLock";
import { ensureFTIWorkflowSchema, type FTIRow } from "@/lib/ftiRecalculation";
import { getFTIRequestFull, invalidateFTICache } from "@/lib/ftiSheets";
import { getAllMiscellaneous } from "@/lib/miscellaneousSheets";
import { renderFTIPdf } from "@/lib/ftiPdf";

const folderId = "1Lzr8kqlrZ94RPVwhVfCgt2H6p5nFORzG";
const pending = (row: FTIRow) => row[11] === "PENDING" || row[11] === "FAILED";

async function readRequests(): Promise<FTIRow[]> {
  const sheets = await getSheetsClient();
  const spreadsheetId = await getDatabaseSpreadsheetId();
  return (await sheets.spreadsheets.values.get({ spreadsheetId, range: "FTIRequests!A2:N" })).data.values ?? [];
}

export async function getFTIPdfJobSummary() {
  const rows = await readRequests();
  return { pending: rows.filter(pending).length, failed: rows.filter(r => r[11] === "FAILED").length };
}

export async function queueFTIPdf(controlNo: string) {
  return withFTIWriteLock(async () => {
    await ensureFTIWorkflowSchema();
    const rows = await readRequests();
    const index = rows.findIndex(r => r[0] === controlNo);
    if (index < 0) throw new Error("FTI request not found.");
    const sheets = await getSheetsClient();
    await sheets.spreadsheets.values.batchUpdate({
      spreadsheetId: await getDatabaseSpreadsheetId(),
      requestBody: { valueInputOption: "RAW", data: [{ range: `FTIRequests!L${index + 2}:N${index + 2}`, values: [["PENDING", "", 0]] }] },
    });
    invalidateFTICache();
  });
}

export async function processFTIPdfJobs(limit = 3) {
  let completed = 0, failed = 0;
  const started = Date.now();
  for (let job = 0; job < limit && Date.now() - started < 30_000; job++) {
    const processed = await withFTIWriteLock(async () => {
      await ensureFTIWorkflowSchema();
      const rows = await readRequests();
      const index = rows.findIndex(r => pending(r) && (!r[12] || Date.parse(String(r[12])) <= Date.now()));
      if (index < 0) return false;
      const row = rows[index];
      const sheets = await getSheetsClient();
      const spreadsheetId = await getDatabaseSpreadsheetId();
      try {
        const full = await getFTIRequestFull(String(row[0]), true);
        if (!full) throw new Error("Queued FTI no longer exists.");
        const drive = await getDriveUploadClient();
        let signature: Buffer | undefined;
        if (full.status === "APPROVED" && full.approvedBySignatureUrl) {
          const id = full.approvedBySignatureUrl.match(/^\/api\/images\/drive\/([\w-]+)$/)?.[1];
          if (!id) throw new Error("Unsupported stored FTI signature reference.");
          const image = await drive.files.get({ fileId: id, alt: "media" }, { responseType: "arraybuffer", timeout: 10_000 });
          signature = Buffer.from(image.data as ArrayBuffer);
        }
        const pdf = await renderFTIPdf(full, await getAllMiscellaneous(), signature);
        let fileId = full.ftiFileLink?.match(/^https:\/\/drive\.google\.com\/file\/d\/([\w-]+)\/view(?:\?.*)?$/)?.[1];
        if (full.ftiFileLink && !fileId) throw new Error("Unsupported FTI PDF link; cannot safely replace it.");
        const name = `FTI_${full.controlNo}.pdf`;
        if (!fileId) {
          const escapedName = name.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
          const existing = await drive.files.list({ q: `'${folderId}' in parents and name = '${escapedName}' and trashed = false`, fields: "files(id)" });
          fileId = existing.data.files?.[0]?.id ?? undefined;
        }
        if (fileId) {
          await drive.files.update({ fileId, media: { mimeType: "application/pdf", body: Readable.from(pdf) } }, { timeout: 15_000 });
        } else {
          const created = await drive.files.create({ requestBody: { name, parents: [folderId] }, media: { mimeType: "application/pdf", body: Readable.from(pdf) }, fields: "id" }, { timeout: 15_000, retry: false });
          fileId = created.data.id ?? undefined;
          if (!fileId) throw new Error("Drive did not return a PDF file ID.");
        }
        await sheets.spreadsheets.values.batchUpdate({ spreadsheetId, requestBody: { valueInputOption: "RAW", data: [
          { range: `FTIRequests!E${index + 2}`, values: [[`https://drive.google.com/file/d/${fileId}/view`]] },
          { range: `FTIRequests!L${index + 2}:N${index + 2}`, values: [["", "", 0]] },
        ] } });
        completed++;
      } catch (error) {
        if (isUncertainFTIWrite(error)) throw error;
        const attempts = (Number(row[13]) || 0) + 1;
        const retryAt = new Date(Date.now() + Math.min(60, 2 ** Math.min(attempts, 6)) * 60_000).toISOString();
        await sheets.spreadsheets.values.batchUpdate({ spreadsheetId, requestBody: { valueInputOption: "RAW", data: [
          { range: `FTIRequests!L${index + 2}:N${index + 2}`, values: [["FAILED", retryAt, attempts]] },
        ] } });
        failed++;
      } finally { invalidateFTICache(); }
      return true;
    });
    if (!processed) break;
  }
  return { completed, failedThisRun: failed, ...await getFTIPdfJobSummary() };
}
