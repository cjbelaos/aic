import { getCompanyContacts } from "@/lib/companyContactSheets";
import { quotationRecipients, sameQuotationRecipients, type QuotationRecipients } from "@/lib/quotationRecipients";
import { getQuotationByRefNo } from '@/lib/quotationSheets';
import { getQuotationHistory, preserveLegacyQuotation, saveQuotationHistoryAttempt, completeQuotationSend } from '@/lib/quotationHistory';
import { withQuotationLock } from '@/lib/quotationLock';
import { createQuotationPdf } from '@/lib/quotationPdfStorage';
import { assertQuotationTerms, QuotationError } from '@/lib/quotationTerms';
import { quotationDisplayRevision, quotationRevisionLabel, quotationSnapshotToken } from '@/lib/quotationRevision';
import { isDraftQuotationReference } from '@/lib/quotationReference';
import type { Quotation } from '@/types/quotation';
import type { QuotationHistoryEntry } from '@/types/quotation-history';

interface SendInput { quotationNo: string; sendId: string; snapshotToken: string; recipient: string; cc: string[]; actor: string; pdfBuffer: Buffer }
type Delivery = (quotation: Quotation, label: string, recipients: QuotationRecipients) => Promise<{ messageId: string; accepted: unknown[] }>;

export async function sendQuotationVersion(input: SendInput, deliver: Delivery) {
  if (typeof input.quotationNo !== 'string' || !input.quotationNo.trim()) throw new QuotationError('A quotation number is required.');
  input = { ...input, quotationNo: input.quotationNo.trim() };
  if (!/^[\w-]{16,100}$/.test(input.sendId) || !input.snapshotToken) throw new QuotationError('A send ID and saved quotation snapshot are required.');
  if (!/^[^\s@,;]+@[^\s@,;]+\.[^\s@,;]+$/.test(input.recipient)) throw new QuotationError('One valid recipient email address is required.');
  if (!Array.isArray(input.cc) || input.cc.some(email => typeof email !== 'string')) throw new QuotationError('Review the quotation recipients before sending.');
  if (input.pdfBuffer.length > 20_000_000 || !input.pdfBuffer.subarray(0, 5).equals(Buffer.from('%PDF-'))) throw new QuotationError('A valid quotation PDF under 20 MB is required.');
  return withQuotationLock(input.quotationNo, async () => {
    const history = await getQuotationHistory(input.quotationNo);
    const previous = history.find(e => e.sendId === input.sendId);
    if (previous && (previous.snapshotToken !== input.snapshotToken || previous.recipient !== input.recipient || JSON.stringify(previous.snapshot.emailRecipients?.cc || []) !== JSON.stringify(input.cc))) throw new QuotationError('This send ID was reused for a different quotation or recipient.', 409);
    if (previous?.state === 'SENT') return { revision: previous.revision, fileLink: previous.file, sendId: previous.sendId };
    if (history.some(e => e.state === 'SENDING' || e.state === 'UNCERTAIN')) throw new QuotationError('A previous delivery is in progress or uncertain. Confirm its delivery and reconcile the history before sending again.', 409);
    const q = await getQuotationByRefNo(input.quotationNo);
    if (!q) throw new QuotationError('Quotation not found.', 404);
    assertQuotationTerms(q);
    if (isDraftQuotationReference(q.quotationNo)) throw new QuotationError('Save the quotation with a quotation number before sending.');
    if (quotationSnapshotToken(q) !== input.snapshotToken) throw new QuotationError('The quotation changed. Load the latest saved quotation and regenerate its PDF.', 409);
    const recipients = quotationRecipients(q.customerId, await getCompanyContacts());
    if (!sameQuotationRecipients(recipients, { to: input.recipient, cc: input.cc })) throw new QuotationError('Company contacts changed or the recipient list is incomplete. Review the recipients again before sending.', 409);
    await preserveLegacyQuotation(q);
    const revision = quotationDisplayRevision(q), sentAt = new Date().toISOString();
    const snapshot: Quotation = { ...q, revision, revisionPending: false, status: 'SENT', lastSentAt: sentAt, sentBy: input.actor, emailRecipients: recipients };
    const file = await createQuotationPdf(snapshot, input.pdfBuffer);
    snapshot.file = file;
    const entry: QuotationHistoryEntry = { sendId: input.sendId, quotationNo: q.quotationNo, revision, state: 'SENDING', file, snapshot, sentBy: input.actor, recipient: input.recipient, sentAt: '', messageId: '', error: '', snapshotToken: input.snapshotToken };
    await saveQuotationHistoryAttempt(entry);
    let delivery: Awaited<ReturnType<Delivery>> | undefined;
    try {
      delivery = await deliver(snapshot, quotationRevisionLabel(snapshot), recipients);
      const accepted = delivery.accepted.map(value => String(value).toLowerCase());
      if (![recipients.to, ...recipients.cc].every(email => accepted.includes(email))) throw new Error('Some recipients were not accepted. Delivery may be partial; reconcile before retrying.');
    } catch (error) {
      const code = (error as { responseCode?: number }).responseCode;
      const rejected = typeof code === 'number' && code >= 400;
      const message = error instanceof Error ? error.message : 'Email delivery failed.';
      await saveQuotationHistoryAttempt({ ...entry, state: rejected ? 'FAILED' : 'UNCERTAIN', messageId: delivery?.messageId || '', error: message });
      throw new QuotationError(rejected ? message : 'Email delivery is uncertain. Confirm delivery before retrying; the PDF and pending history have been preserved.', rejected ? 502 : 409);
    }
    try {
      const completedAt = new Date().toISOString();
      snapshot.lastSentAt = completedAt;
      await completeQuotationSend({ ...entry, state: 'SENT', sentAt: completedAt, snapshot, messageId: delivery.messageId });
    } catch {
      // The final batch may have committed despite a lost response. Read it before classifying uncertainty.
      const recorded = (await getQuotationHistory(q.quotationNo).catch(() => [])).find(e => e.sendId === input.sendId && e.state === 'SENT');
      if (recorded) return { revision: recorded.revision, fileLink: recorded.file, sendId: recorded.sendId };
      await saveQuotationHistoryAttempt({ ...entry, state: 'UNCERTAIN', sentAt, messageId: delivery.messageId, error: 'SMTP accepted delivery, but completing the send record failed. Reconcile before resending.' }).catch(() => {});
      throw new QuotationError('The email was accepted, but recording its history is uncertain. Confirm the send record before resending.', 409);
    }
    return { revision, fileLink: file, sendId: input.sendId };
  });
}
