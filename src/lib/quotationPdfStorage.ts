import { Readable } from 'stream';
import { getDriveUploadClient } from '@/lib/googleSheets';
import { quotationRevisionLabel } from '@/lib/quotationRevision';
import type { Quotation } from '@/types/quotation';

/** Each generated PDF has a new Drive ID; sent history never shares an overwritten file. */
export async function createQuotationPdf(q: Quotation, pdfBuffer: Buffer): Promise<string> {
  const drive = await getDriveUploadClient();
  const folderId = process.env.GOOGLE_DRIVE_FOLDER_ID;
  if (!folderId) throw new Error('Missing GOOGLE_DRIVE_FOLDER_ID environment variable.');
  const result = await drive.files.create({ requestBody: {
    name: `Quotation - ${quotationRevisionLabel(q)} - ${q.customer}.pdf`.replace(/[/\\?%*:'|"<>]/g, '_'),
    parents: [folderId], mimeType: 'application/pdf',
  }, media: { mimeType: 'application/pdf', body: Readable.from(pdfBuffer) }, fields: 'id' });
  if (!result.data.id) throw new Error('Drive did not return a quotation PDF ID.');
  return `https://drive.google.com/file/d/${result.data.id}/view`;
}

export async function copyLegacyQuotationPdf(q: Quotation): Promise<string> {
  const fileId = q.file.match(/\/d\/([\w-]+)/)?.[1] || q.file.match(/[?&]id=([\w-]+)/)?.[1];
  if (!fileId) throw new Error('The previously sent PDF link is invalid. Recover it before revising this quotation.');
  const drive = await getDriveUploadClient();
  const copied = await drive.files.copy({ fileId, requestBody: { name: `Quotation - ${quotationRevisionLabel(q)} - original sent archive.pdf` }, fields: 'id' });
  if (!copied.data.id) throw new Error('Unable to archive the previously sent quotation PDF.');
  return `https://drive.google.com/file/d/${copied.data.id}/view`;
}
